import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GateAction, GateMethod } from './entities/gate-action.entity';
import { GateConfig } from './entities/gate-config.entity';
import { GateControllerService } from '../integrations/gate-controller/gate-controller.service';

@Injectable()
export class GateService implements OnModuleInit {
  private readonly logger = new Logger(GateService.name);

  constructor(
    @InjectRepository(GateAction)
    private actionsRepository: Repository<GateAction>,
    @InjectRepository(GateConfig)
    private configRepository: Repository<GateConfig>,
    private gateController: GateControllerService,
  ) {}

  async onModuleInit() {
    const count = await this.configRepository.count();
    if (count === 0) {
      await this.configRepository.save({
        name: 'Portón Principal',
        status: 'closed',
        position: 0,
        autoCloseEnabled: true,
        autoCloseSeconds: 180,
        doubleConfirmation: true,
        faceRecognitionAccess: true,
        plateRecognitionAccess: true,
        controllerIp: '192.168.68.51',
        controllerPort: 1883,
      });
      console.log('✅ Default gate config seeded');
    }
  }

  async getConfig(): Promise<GateConfig> {
    const configs = await this.configRepository.find({ take: 1 });
    return configs[0];
  }

  async getStatus() {
    const config = await this.getConfig();
    const health = this.gateController.getLastHealthCheck();
    const mqttInfo = this.gateController.getConnectionInfo();

    return {
      status: config.status,
      position: config.position,
      name: config.name,
      autoCloseEnabled: config.autoCloseEnabled,
      autoCloseSeconds: config.autoCloseSeconds,
      doubleConfirmation: config.doubleConfirmation,
      faceRecognitionAccess: config.faceRecognitionAccess,
      plateRecognitionAccess: config.plateRecognitionAccess,
      obstacle: false,
      locked: false,
      controllerReachable: health?.reachable ?? false,
      brokerIp: mqttInfo.brokerIp,
      mqttPort: mqttInfo.mqttPort,
    };
  }

  /**
   * Trigger gate open.
   * The physical gate is a toggle relay — we send a pulse and track state in DB.
   * Since there's no hardware state feedback, we toggle the DB state optimistically.
   */
  async open(userId?: string, userName?: string, method: GateMethod = 'manual_app', ipAddress?: string): Promise<boolean> {
    const config = await this.getConfig();

    // Send relay pulse to the physical gate via MQTT
    const commandSent = await this.gateController.open();
    if (!commandSent) {
      this.logger.error('Gate OPEN command failed — MQTT broker unreachable');
      await this.actionsRepository.save({
        action: 'open',
        method,
        userId,
        userName: userName || 'Desconocido',
        ipAddress,
        success: false,
        detail: 'MQTT broker unreachable',
      });
      return false;
    }

    // Toggle DB state — the relay is a momentary toggle, so we flip the state
    const newStatus = config.status === 'closed' ? 'open' : 'closed';
    await this.configRepository.update(config.id, { status: newStatus, position: newStatus === 'open' ? 100 : 0 });

    await this.actionsRepository.save({
      action: newStatus === 'open' ? 'open' : 'close',
      method,
      userId,
      userName: userName || 'Desconocido',
      ipAddress,
      success: true,
      detail: `Pulso de relé enviado — estado: ${newStatus}`,
    });

    this.logger.log(`Gate toggled → ${newStatus} by ${userName || 'unknown'} (${method})`);

    // Auto-close timer (only if we just opened)
    if (newStatus === 'open' && config.autoCloseEnabled) {
      setTimeout(async () => {
        try {
          const current = await this.getConfig();
          if (current.status === 'open') {
            await this.close(undefined, 'Sistema', 'automatic');
          }
        } catch (err) {
          this.logger.error(`Auto-close failed: ${err.message}`);
        }
      }, config.autoCloseSeconds * 1000);
    }

    return true;
  }

  /**
   * Trigger gate close.
   * Same relay pulse — the motor toggles direction.
   */
  async close(userId?: string, userName?: string, method: GateMethod = 'manual_app', ipAddress?: string): Promise<boolean> {
    const config = await this.getConfig();

    const commandSent = await this.gateController.close();
    if (!commandSent) {
      this.logger.error('Gate CLOSE command failed — MQTT broker unreachable');
      await this.actionsRepository.save({
        action: 'close',
        method,
        userId,
        userName: userName || 'Sistema',
        ipAddress,
        success: false,
        detail: 'MQTT broker unreachable',
      });
      return false;
    }

    // Toggle DB state
    const newStatus = config.status === 'open' ? 'closed' : 'open';
    await this.configRepository.update(config.id, { status: newStatus, position: newStatus === 'open' ? 100 : 0 });

    await this.actionsRepository.save({
      action: newStatus === 'closed' ? 'close' : 'open',
      method,
      userId,
      userName: userName || 'Sistema',
      ipAddress,
      success: true,
      detail: `Pulso de relé enviado — estado: ${newStatus}`,
    });

    this.logger.log(`Gate toggled → ${newStatus} by ${userName || 'unknown'} (${method})`);
    return true;
  }

  /**
   * Emergency stop — cut relay immediately
   */
  async stop(): Promise<boolean> {
    const result = await this.gateController.stop();
    if (result) {
      const config = await this.getConfig();
      await this.configRepository.update(config.id, { status: 'closed' });
      await this.actionsRepository.save({
        action: 'close',
        method: 'manual_app',
        userName: 'Sistema',
        success: true,
        detail: 'Parada de emergencia',
      });
    }
    return result;
  }

  async getHistory(limit: number = 50): Promise<GateAction[]> {
    return this.actionsRepository.find({
      order: { timestamp: 'DESC' },
      take: limit,
    });
  }

  async updateConfig(data: Partial<GateConfig>): Promise<GateConfig> {
    const config = await this.getConfig();
    await this.configRepository.update(config.id, data);
    return this.getConfig();
  }

  async getStats() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayActions = await this.actionsRepository
      .createQueryBuilder('action')
      .where('action.timestamp >= :today', { today })
      .getMany();

    return {
      totalToday: todayActions.length,
      opensToday: todayActions.filter(a => a.action === 'open').length,
      autoToday: todayActions.filter(a => a.method === 'automatic').length,
      aiToday: todayActions.filter(a => ['face_recognition', 'plate_recognition'].includes(a.method)).length,
      alertsToday: todayActions.filter(a => !a.success).length,
    };
  }
}
