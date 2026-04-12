import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Alarm, AlarmMode } from './entities/alarm.entity';
import { AlarmEvent, AlarmEventType } from './entities/alarm-event.entity';
import { TuyaService } from '../integrations/tuya/tuya.service';

@Injectable()
export class AlarmService {
  private readonly logger = new Logger(AlarmService.name);

  constructor(
    @InjectRepository(Alarm)
    private alarmRepo: Repository<Alarm>,
    @InjectRepository(AlarmEvent)
    private eventRepo: Repository<AlarmEvent>,
    private tuyaService: TuyaService,
  ) {}

  // ─── CRUD ──────────────────────────────────────────────────────────────

  async findAll() {
    return this.alarmRepo.find({
      where: { isActive: true },
      order: { createdAt: 'ASC' },
    });
  }

  async findOne(id: string) {
    const alarm = await this.alarmRepo.findOne({ where: { id } });
    if (!alarm) throw new NotFoundException('Alarm not found');
    return alarm;
  }

  async remove(id: string) {
    const alarm = await this.findOne(id);
    alarm.isActive = false;
    await this.alarmRepo.save(alarm);
    return { success: true };
  }

  // ─── Tuya sync ─────────────────────────────────────────────────────────

  /** Discover alarm devices from Tuya and return them */
  async discoverDevices() {
    const devices = await this.tuyaService.getDevices();
    // Return ALL devices — the user picks which one is the alarm from the UI.
    // Tuya categories for alarms vary widely: mal, ylkg, ywbj, sj, ms, etc.
    return devices.map((d) => ({
      tuyaDeviceId: d.id,
      name: d.name,
      model: d.product_name,
      online: d.online,
      category: d.category,
      status: d.status,
    }));
  }

  /** Register a Tuya device as a managed alarm */
  async registerDevice(
    tuyaDeviceId: string,
    name?: string,
    zone?: string,
    localIp?: string,
  ) {
    // Check if already registered
    let alarm = await this.alarmRepo.findOne({ where: { tuyaDeviceId } });
    if (alarm) {
      alarm.isActive = true;
      if (name) alarm.name = name;
      if (zone) alarm.zone = zone;
      if (localIp) alarm.localIp = localIp;
      await this.alarmRepo.save(alarm);
      return alarm;
    }

    // Fetch device info from Tuya (includes local_key)
    const info = await this.tuyaService.getDeviceInfo(tuyaDeviceId);

    alarm = await this.alarmRepo.save(
      this.alarmRepo.create({
        tuyaDeviceId,
        name: name || info.name || 'Alarma',
        model: info.product_name || undefined,
        online: info.online,
        zone: zone || 'general',
        localKey: (info as any).local_key || undefined,
        localIp: localIp || undefined,
      }),
    );

    this.logger.log(`Registered alarm: ${alarm.name} (${tuyaDeviceId}) localKey: ${alarm.localKey ? 'YES' : 'NO'}`);
    return alarm;
  }

  /** Pull latest status — tries local first, then cloud */
  async syncStatus(id: string) {
    const alarm = await this.findOne(id);
    const prevMode = alarm.mode;

    // Try local LAN control first (faster, no cloud dependency)
    if (alarm.localKey && alarm.localIp) {
      try {
        const localStatus = await this.tuyaService.getLocalStatus(
          alarm.tuyaDeviceId, alarm.localKey, alarm.localIp,
        );
        alarm.mode = (localStatus.mode as AlarmMode) || alarm.mode;
        alarm.alarmActive = localStatus.alarmActive ?? alarm.alarmActive;
        alarm.online = true;
        alarm.sensors = localStatus.dps || {};
        alarm.lastSyncAt = new Date();
        await this.alarmRepo.save(alarm);

        if (prevMode !== alarm.mode) {
          await this.logEvent(alarm.id, 'mode_change',
            `Modo cambiado: ${prevMode} → ${alarm.mode}`,
            { from: prevMode, to: alarm.mode },
          );
        }
        return alarm;
      } catch (err) {
        this.logger.warn(`Local sync failed for ${alarm.name}: ${err.message}, trying cloud…`);
      }
    }

    // Fallback: Tuya cloud API
    try {
      const status = await this.tuyaService.getAlarmStatus(alarm.tuyaDeviceId);
      alarm.mode = (status.mode as AlarmMode) || 'unknown';
      alarm.alarmActive = status.alarmActive;
      alarm.battery = status.battery;
      alarm.online = true;
      alarm.sensors = status.statuses?.reduce(
        (acc: Record<string, any>, s: any) => ({ ...acc, [s.code]: s.value }), {},
      ) || {};
      alarm.lastSyncAt = new Date();
      await this.alarmRepo.save(alarm);
    } catch (err) {
      this.logger.warn(`Cloud sync also failed for ${alarm.name}: ${err.message}`);
      alarm.online = false;
      await this.alarmRepo.save(alarm);
    }

    if (prevMode !== alarm.mode) {
      await this.logEvent(alarm.id, 'mode_change',
        `Modo cambiado: ${prevMode} → ${alarm.mode}`,
        { from: prevMode, to: alarm.mode },
      );
    }

    return alarm;
  }

  /** Sync all active alarms */
  async syncAll() {
    const alarms = await this.findAll();
    const results: { id: string; name: string; success: boolean; error?: string }[] = [];
    for (const alarm of alarms) {
      try {
        const updated = await this.syncStatus(alarm.id);
        results.push({ id: updated.id, name: updated.name, success: true });
      } catch (err: any) {
        // Mark offline
        alarm.online = false;
        await this.alarmRepo.save(alarm);
        await this.logEvent(alarm.id, 'offline', `Alarma offline: ${err.message}`);
        results.push({ id: alarm.id, name: alarm.name, success: false, error: err.message });
      }
    }
    return results;
  }

  // ─── Commands ──────────────────────────────────────────────────────────

  async setMode(id: string, mode: 'arm' | 'disarm' | 'home', triggeredBy?: string) {
    const alarm = await this.findOne(id);
    const prevMode = alarm.mode;

    // Try local first, then cloud
    if (alarm.localKey && alarm.localIp) {
      try {
        await this.tuyaService.setLocalAlarmMode(
          alarm.tuyaDeviceId, alarm.localKey, alarm.localIp, mode,
        );
      } catch (err) {
        this.logger.warn(`Local setMode failed: ${err.message}, trying cloud…`);
        await this.tuyaService.setAlarmMode(alarm.tuyaDeviceId, mode);
      }
    } else {
      await this.tuyaService.setAlarmMode(alarm.tuyaDeviceId, mode);
    }

    alarm.mode = mode;
    alarm.lastSyncAt = new Date();
    await this.alarmRepo.save(alarm);

    await this.logEvent(
      alarm.id,
      'mode_change',
      `Alarma ${mode === 'arm' ? 'armada' : mode === 'disarm' ? 'desarmada' : 'modo hogar'}`,
      { from: prevMode, to: mode },
      triggeredBy || 'manual',
    );

    return alarm;
  }

  async triggerSiren(id: string, active: boolean, triggeredBy?: string) {
    const alarm = await this.findOne(id);

    if (alarm.localKey && alarm.localIp) {
      try {
        await this.tuyaService.setLocalSiren(
          alarm.tuyaDeviceId, alarm.localKey, alarm.localIp, active,
        );
      } catch (err) {
        this.logger.warn(`Local siren failed: ${err.message}, trying cloud…`);
        await this.tuyaService.triggerSiren(alarm.tuyaDeviceId, active);
      }
    } else {
      await this.tuyaService.triggerSiren(alarm.tuyaDeviceId, active);
    }

    alarm.alarmActive = active;
    await this.alarmRepo.save(alarm);

    await this.logEvent(
      alarm.id,
      active ? 'alarm_triggered' : 'alarm_cleared',
      active ? 'Sirena activada manualmente' : 'Sirena desactivada',
      {},
      triggeredBy || 'manual',
    );

    return alarm;
  }

  // ─── Events ────────────────────────────────────────────────────────────

  async getEvents(alarmId?: string, limit = 50) {
    const where: any = {};
    if (alarmId) where.alarmId = alarmId;

    return this.eventRepo.find({
      where,
      order: { timestamp: 'DESC' },
      take: limit,
    });
  }

  private async logEvent(
    alarmId: string,
    type: AlarmEventType,
    message: string,
    detail?: Record<string, any>,
    triggeredBy?: string,
  ) {
    await this.eventRepo.save({ alarmId, type, message, detail, triggeredBy });
  }

  // ─── Dashboard summary ────────────────────────────────────────────────

  async getSummary() {
    const alarms = await this.findAll();
    const recentEvents = await this.eventRepo.find({
      order: { timestamp: 'DESC' },
      take: 10,
    });

    return {
      total: alarms.length,
      armed: alarms.filter((a) => a.mode === 'arm').length,
      disarmed: alarms.filter((a) => a.mode === 'disarm').length,
      homeMode: alarms.filter((a) => a.mode === 'home').length,
      alarmsTriggered: alarms.filter((a) => a.alarmActive).length,
      offline: alarms.filter((a) => !a.online).length,
      alarms,
      recentEvents,
    };
  }
}
