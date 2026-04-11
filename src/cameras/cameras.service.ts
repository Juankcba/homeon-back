import { Injectable, Logger, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Camera } from './entities/camera.entity';
import {
  CameraCreateDto,
  CameraUpdateDto,
  CameraSnapshotDto,
  CameraStreamUrlDto,
  CameraEventDto,
  CameraTestResultDto,
} from './dto/camera.dto';
import { TapoService } from '../integrations/tapo/tapo.service';

@Injectable()
export class CamerasService {
  private readonly logger = new Logger(CamerasService.name);

  constructor(
    @InjectRepository(Camera)
    private camerasRepository: Repository<Camera>,
    private tapoService: TapoService,
  ) {}

  // ─── CRUD ────────────────────────────────────────────────────────

  async findAll(): Promise<Camera[]> {
    return this.camerasRepository.find({
      where: { isActive: true },
      order: { sortOrder: 'ASC', name: 'ASC' },
    });
  }

  async findOne(id: string): Promise<Camera> {
    const camera = await this.camerasRepository.findOne({ where: { id, isActive: true } });
    if (!camera) throw new NotFoundException(`Camera ${id} not found`);
    return camera;
  }

  /**
   * Create a new camera. If model/firmware/mac are omitted, attempts to
   * auto-discover them by connecting to the Tapo camera at the given IP.
   */
  async create(dto: CameraCreateDto): Promise<Camera> {
    // Check for duplicate IP
    const existing = await this.camerasRepository.findOne({
      where: { ip: dto.ip, isActive: true },
    });
    if (existing) {
      throw new ConflictException(`A camera with IP ${dto.ip} already exists: "${existing.name}"`);
    }

    // Auto-discover device info from Tapo if not provided
    let autoModel = dto.model;
    let autoFirmware: string | undefined;
    let autoMac: string | undefined;
    let initialStatus: 'online' | 'offline' = 'offline';

    try {
      const info = await this.tapoService.getDeviceInfo(dto.ip);
      if (info) {
        autoModel = autoModel || info.device_model || 'Tapo Unknown';
        autoFirmware = info.firmware_ver;
        autoMac = info.mac;
        initialStatus = 'online';
        this.logger.log(`Auto-discovered camera at ${dto.ip}: ${autoModel} (fw ${autoFirmware})`);
      }
    } catch (error) {
      this.logger.warn(`Could not auto-discover camera at ${dto.ip}: ${error.message}. Saving with provided data.`);
    }

    const camera = this.camerasRepository.create({
      name: dto.name,
      location: dto.location,
      ip: dto.ip,
      zone: dto.zone || 'Interior',
      model: autoModel || 'Tapo',
      firmware: autoFirmware,
      mac: autoMac,
      resolution: dto.resolution || '1920x1080',
      fps: dto.fps || 25,
      codec: 'H.264',
      status: initialStatus,
      features: { nightVision: true, audio: true, motionDetection: true },
      rtspUsername: dto.rtspUsername || undefined,
      rtspPassword: dto.rtspPassword || undefined,
      lastPing: initialStatus === 'online' ? new Date() : undefined,
    });

    return this.camerasRepository.save(camera);
  }

  async update(id: string, dto: CameraUpdateDto): Promise<Camera> {
    const camera = await this.findOne(id);

    // If IP changed, check for duplicates
    if (dto.ip && dto.ip !== camera.ip) {
      const dup = await this.camerasRepository.findOne({
        where: { ip: dto.ip, isActive: true },
      });
      if (dup && dup.id !== id) {
        throw new ConflictException(`IP ${dto.ip} already assigned to "${dup.name}"`);
      }
    }

    await this.camerasRepository.update(id, dto as any);
    return this.findOne(id);
  }

  /**
   * Soft-delete: marks camera as inactive. Can be restored later.
   */
  async remove(id: string): Promise<{ deleted: boolean; name: string }> {
    const camera = await this.findOne(id);
    await this.camerasRepository.update(id, { isActive: false });
    this.logger.log(`Camera "${camera.name}" (${camera.ip}) removed`);
    return { deleted: true, name: camera.name };
  }

  /**
   * Hard-delete: permanently removes camera record.
   */
  async destroy(id: string): Promise<{ destroyed: boolean; name: string }> {
    const camera = await this.findOne(id);
    await this.camerasRepository.delete(id);
    this.logger.log(`Camera "${camera.name}" permanently destroyed`);
    return { destroyed: true, name: camera.name };
  }

  // ─── Test connection ─────────────────────────────────────────────

  /**
   * Test connectivity to a Tapo camera by IP. Useful before adding a camera,
   * or to diagnose an existing one.
   */
  async testConnection(ip: string): Promise<CameraTestResultDto> {
    const result: CameraTestResultDto = {
      reachable: false,
      authenticated: false,
    };

    try {
      const reachable = await this.tapoService.ping(ip);
      result.reachable = reachable;
      if (!reachable) {
        result.error = `Camera at ${ip} is not reachable`;
        return result;
      }

      const info = await this.tapoService.getDeviceInfo(ip);
      if (info) {
        result.authenticated = true;
        result.model = info.device_model;
        result.firmware = info.firmware_ver;
        result.mac = info.mac;
      }
    } catch (error) {
      result.error = error.message;
    }

    return result;
  }

  /**
   * Full diagnostic of a camera IP — tests every layer.
   */
  async diagnose(ip: string) {
    return this.tapoService.diagnose(ip);
  }

  /**
   * Full diagnostic of an existing camera by ID.
   */
  async diagnoseById(id: string) {
    const camera = await this.findOne(id);
    const result = await this.tapoService.diagnose(camera.ip, camera.rtspUsername, camera.rtspPassword);
    return {
      camera: { id: camera.id, name: camera.name, ip: camera.ip, hasRtspCredentials: !!(camera.rtspUsername && camera.rtspPassword) },
      ...result,
    };
  }

  /**
   * Re-discover device info for an existing camera (refresh model, firmware, mac).
   */
  async rediscover(id: string): Promise<Camera> {
    const camera = await this.findOne(id);
    try {
      const info = await this.tapoService.getDeviceInfo(camera.ip);
      if (info) {
        await this.camerasRepository.update(id, {
          model: info.device_model || camera.model,
          firmware: info.firmware_ver || camera.firmware,
          mac: info.mac || camera.mac,
          status: 'online',
          lastPing: new Date(),
        });
        this.logger.log(`Re-discovered camera "${camera.name}": ${info.device_model}`);
      }
    } catch (error) {
      this.logger.warn(`Re-discover failed for "${camera.name}": ${error.message}`);
    }
    return this.findOne(id);
  }

  // ─── Camera actions ──────────────────────────────────────────────

  /**
   * Get raw snapshot buffer from camera (used by proxy endpoint).
   */
  async getSnapshotBuffer(id: string): Promise<Buffer | null> {
    const camera = await this.findOne(id);
    try {
      const buffer = await this.tapoService.getSnapshot(camera.ip, camera.rtspUsername, camera.rtspPassword);
      if (buffer && buffer.length > 0) return buffer;
    } catch (error) {
      this.logger.warn(`Snapshot buffer failed for "${camera.name}": ${error.message}`);
    }
    return null;
  }

  async getSnapshot(id: string): Promise<CameraSnapshotDto> {
    const camera = await this.findOne(id);
    try {
      const buffer = await this.tapoService.getSnapshot(camera.ip, camera.rtspUsername, camera.rtspPassword);
      if (buffer) {
        return {
          url: `http://${camera.ip}:2020/onvif-http/snapshot?channel=1`,
          timestamp: new Date(),
        };
      }
    } catch (error) {
      this.logger.warn(`Snapshot failed for camera "${camera.name}": ${error.message}`);
    }
    // Fallback: direct ONVIF URL
    return {
      url: `http://${camera.ip}:2020/onvif-http/snapshot?channel=1`,
      timestamp: new Date(),
    };
  }

  async restart(id: string): Promise<boolean> {
    const camera = await this.findOne(id);
    await this.camerasRepository.update(id, { status: 'offline' });

    const rebooted = await this.tapoService.reboot(camera.ip);
    if (!rebooted) {
      this.logger.warn(`Reboot command failed for "${camera.name}", will poll for recovery`);
    }

    // Poll for camera to come back online (up to 60 seconds)
    let attempts = 0;
    const pollInterval = setInterval(async () => {
      attempts++;
      const isUp = await this.tapoService.ping(camera.ip);
      if (isUp) {
        await this.camerasRepository.update(id, { status: 'online', lastPing: new Date() });
        this.logger.log(`Camera "${camera.name}" back online after reboot`);
        clearInterval(pollInterval);
      } else if (attempts >= 12) {
        this.logger.error(`Camera "${camera.name}" did not recover after reboot`);
        clearInterval(pollInterval);
      }
    }, 5000);

    return true;
  }

  async getStreamUrl(id: string): Promise<CameraStreamUrlDto> {
    const camera = await this.findOne(id);
    const urls = this.tapoService.getStreamUrls(camera.ip, camera.rtspUsername, camera.rtspPassword);
    return {
      rtsp: urls.rtspMain,
      http: urls.rtspSub,
      hls: urls.rtspMain, // In production: transcode RTSP → HLS via media server
    };
  }

  async setMotionDetection(id: string, enabled: boolean): Promise<boolean> {
    const camera = await this.findOne(id);
    const success = await this.tapoService.setMotionDetection(camera.ip, enabled);
    if (success) {
      const features = { ...camera.features, motionDetection: enabled };
      await this.camerasRepository.update(id, { features });
    }
    return success;
  }

  async setLensMask(id: string, enabled: boolean): Promise<boolean> {
    const camera = await this.findOne(id);
    return this.tapoService.setLensMask(camera.ip, enabled);
  }

  async getLedStatus(id: string): Promise<boolean> {
    const camera = await this.findOne(id);
    return this.tapoService.getLedStatus(camera.ip);
  }

  async setLedStatus(id: string, enabled: boolean): Promise<boolean> {
    const camera = await this.findOne(id);
    return this.tapoService.setLedStatus(camera.ip, enabled);
  }

  // ─── Events (placeholder until event store is implemented) ───────

  async getEvents(id: string, limit: number = 10): Promise<CameraEventDto[]> {
    const camera = await this.findOne(id);
    // TODO: Query actual camera events from event store
    const events: CameraEventDto[] = [];
    const types = ['motion', 'person', 'vehicle'];
    const descriptions = ['Movimiento detectado', 'Persona detectada', 'Vehículo detectado'];
    for (let i = 0; i < Math.min(limit, 10); i++) {
      events.push({
        id: `event-${camera.id}-${i}`,
        type: types[i % 3],
        timestamp: new Date(Date.now() - i * 5 * 60000),
        description: `${descriptions[i % 3]} en ${camera.location}`,
        snapshotUrl: undefined,
      });
    }
    return events;
  }

  // ─── Stats ───────────────────────────────────────────────────────

  async getStats() {
    const cameras = await this.camerasRepository.find({ where: { isActive: true } });
    return {
      total: cameras.length,
      online: cameras.filter(c => c.status === 'online').length,
      offline: cameras.filter(c => c.status === 'offline').length,
      recording: cameras.filter(c => c.status === 'recording').length,
      alerts: cameras.filter(c => c.lastMotion && (Date.now() - new Date(c.lastMotion).getTime()) < 600000).length,
    };
  }

  // ─── Health polling ──────────────────────────────────────────────

  /**
   * Ping all active cameras every 60 seconds to track online/offline status.
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async pollCameraHealth() {
    const cameras = await this.camerasRepository.find({ where: { isActive: true } });
    for (const camera of cameras) {
      const isUp = await this.tapoService.ping(camera.ip);
      const newStatus = isUp ? 'online' : 'offline';
      if (newStatus !== camera.status) {
        this.logger.log(`Camera "${camera.name}" status: ${camera.status} → ${newStatus}`);
        await this.camerasRepository.update(camera.id, { status: newStatus, lastPing: new Date() });
      } else {
        await this.camerasRepository.update(camera.id, { lastPing: new Date() });
      }
    }
  }
}
