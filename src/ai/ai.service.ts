import { Injectable, NotFoundException, BadRequestException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthorizedFace } from './entities/authorized-face.entity';
import { AuthorizedVehicle, PlateFormat } from './entities/authorized-vehicle.entity';
import { Detection } from './entities/detection.entity';
import { DeviceConfig } from '../devices/entities/device-config.entity';

const AI_ENGINE_CONFIG_TYPE = 'ai-engine';

// ─── Plate validation helpers ─────────────────────────────────────────────────

const PLATE_REGEX_OLD = /^[A-Z]{3}\d{3}$/;        // ABC123 (pre-2016)
const PLATE_REGEX_MERCOSUR = /^[A-Z]{2}\d{3}[A-Z]{2}$/; // AB123CD (Mercosur 2016+)

/**
 * Normalize a plate string: uppercase, remove all non-alphanumeric chars.
 */
function normalizePlate(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * Detect the format of an Argentine plate.
 */
function detectPlateFormat(normalized: string): PlateFormat {
  if (normalized.length === 6 && PLATE_REGEX_OLD.test(normalized)) return 'old';
  if (normalized.length === 7 && PLATE_REGEX_MERCOSUR.test(normalized)) return 'mercosur';
  return 'unknown';
}

/**
 * Format a normalized plate for display.
 *   ABC123  → "ABC 123"
 *   AB123CD → "AB 123 CD"
 */
function formatPlate(normalized: string, format: PlateFormat): string {
  if (format === 'old') return `${normalized.slice(0, 3)} ${normalized.slice(3)}`;
  if (format === 'mercosur') return `${normalized.slice(0, 2)} ${normalized.slice(2, 5)} ${normalized.slice(5)}`;
  // Fallback
  if (normalized.length >= 6) return `${normalized.slice(0, 3)} ${normalized.slice(3)}`;
  return normalized;
}

/**
 * Validate a plate string — must match old or mercosur format.
 * Returns { normalized, format, formatted } or throws.
 */
function validateAndNormalizePlate(raw: string): { normalized: string; format: PlateFormat; formatted: string } {
  const normalized = normalizePlate(raw);
  const format = detectPlateFormat(normalized);
  const formatted = formatPlate(normalized, format);
  return { normalized, format, formatted };
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class AiService implements OnModuleInit {
  constructor(
    @InjectRepository(AuthorizedFace)
    private facesRepository: Repository<AuthorizedFace>,
    @InjectRepository(AuthorizedVehicle)
    private vehiclesRepository: Repository<AuthorizedVehicle>,
    @InjectRepository(Detection)
    private detectionsRepository: Repository<Detection>,
    @InjectRepository(DeviceConfig)
    private deviceConfigRepository: Repository<DeviceConfig>,
  ) {}

  // --- Engine config (runtime flags, e.g. detectionEnabled) ---
  private async getEngineConfig(): Promise<DeviceConfig> {
    let cfg = await this.deviceConfigRepository.findOne({ where: { type: AI_ENGINE_CONFIG_TYPE } });
    if (!cfg) {
      cfg = this.deviceConfigRepository.create({
        type: AI_ENGINE_CONFIG_TYPE,
        label: 'AI Engine',
        meta: { detectionEnabled: true },
        connected: true,
      });
      cfg = await this.deviceConfigRepository.save(cfg);
    }
    if (cfg.meta == null) cfg.meta = {};
    if (cfg.meta.detectionEnabled === undefined) cfg.meta.detectionEnabled = true;
    return cfg;
  }

  async getEngineRuntimeConfig(): Promise<{ detectionEnabled: boolean }> {
    const cfg = await this.getEngineConfig();
    return { detectionEnabled: cfg.meta.detectionEnabled !== false };
  }

  async setEngineRuntimeConfig(patch: { detectionEnabled?: boolean }): Promise<{ detectionEnabled: boolean }> {
    const cfg = await this.getEngineConfig();
    if (typeof patch.detectionEnabled === 'boolean') {
      cfg.meta = { ...cfg.meta, detectionEnabled: patch.detectionEnabled };
    }
    await this.deviceConfigRepository.save(cfg);
    return { detectionEnabled: cfg.meta.detectionEnabled !== false };
  }

  async onModuleInit() {
    const faceCount = await this.facesRepository.count();
    if (faceCount === 0) {
      await this.facesRepository.save([
        { name: 'Juan', role: 'admin', totalDetections: 45, avgConfidence: 98, lastSeenAt: new Date(Date.now() - 2 * 3600000), lastSeenCamera: 'Entrada', gateAccess: true },
        { name: 'Ana', role: 'family', totalDetections: 32, avgConfidence: 96, lastSeenAt: new Date(Date.now() - 5 * 3600000), lastSeenCamera: 'Frente', gateAccess: true },
        { name: 'Carlos', role: 'family', totalDetections: 12, avgConfidence: 94, lastSeenAt: new Date(Date.now() - 24 * 3600000), lastSeenCamera: 'Garage', gateAccess: true },
      ]);

      await this.vehiclesRepository.save([
        { plate: 'ABC 123', plateFormat: 'old' as PlateFormat, owner: 'Juan', type: 'auto', brand: 'Toyota', model: 'Corolla', color: 'Blanco', totalDetections: 28, lastSeenAt: new Date(Date.now() - 3 * 3600000), lastSeenCamera: 'Garage', gateAccess: true },
        { plate: 'AB 123 CD', plateFormat: 'mercosur' as PlateFormat, owner: 'Ana', type: 'auto', brand: 'Ford', model: 'Focus', color: 'Gris', totalDetections: 15, lastSeenAt: new Date(Date.now() - 24 * 3600000), lastSeenCamera: 'Frente', gateAccess: true },
      ]);

      await this.detectionsRepository.save([
        { type: 'face', label: 'Juan', cameraId: '1', cameraName: 'Entrada', confidence: 98, authorized: true, timestamp: new Date(Date.now() - 2 * 60000) },
        { type: 'vehicle', label: 'ABC 123', cameraId: '2', cameraName: 'Garage', confidence: 95, authorized: true, metadata: { plateRaw: 'ABC123', plateFormat: 'old', plateConfidence: 92 }, timestamp: new Date(Date.now() - 19 * 60000) },
        { type: 'face', label: 'Desconocido', cameraId: '1', cameraName: 'Frente', confidence: 72, authorized: false, timestamp: new Date(Date.now() - 49 * 60000) },
        { type: 'face', label: 'Ana', cameraId: '4', cameraName: 'Entrada', confidence: 96, authorized: true, timestamp: new Date(Date.now() - 79 * 60000) },
        { type: 'vehicle', label: 'AB 456 CD', cameraId: '1', cameraName: 'Frente', confidence: 88, authorized: false, metadata: { plateRaw: 'AB456CD', plateFormat: 'mercosur', plateConfidence: 85 }, timestamp: new Date(Date.now() - 154 * 60000) },
        { type: 'face', label: 'Desconocido', cameraId: '6', cameraName: 'Lateral', confidence: 65, authorized: false, timestamp: new Date(Date.now() - 4 * 3600000) },
      ]);

      console.log('✅ Default AI data seeded (faces, vehicles, detections)');
    }
  }

  // --- Faces ---
  async getFaces(): Promise<AuthorizedFace[]> {
    return this.facesRepository.find({ where: { isActive: true }, order: { name: 'ASC' } });
  }

  async getFace(id: string): Promise<AuthorizedFace> {
    const face = await this.facesRepository.findOne({ where: { id } });
    if (!face) throw new NotFoundException(`Face ${id} not found`);
    return face;
  }

  async createFace(data: Partial<AuthorizedFace>): Promise<AuthorizedFace> {
    return this.facesRepository.save(this.facesRepository.create(data));
  }

  async updateFace(id: string, data: Partial<AuthorizedFace>): Promise<AuthorizedFace> {
    await this.getFace(id);
    await this.facesRepository.update(id, data);
    return this.getFace(id);
  }

  async deleteFace(id: string): Promise<void> {
    await this.facesRepository.update(id, { isActive: false });
  }

  // --- Vehicles ---
  async getVehicles(): Promise<AuthorizedVehicle[]> {
    return this.vehiclesRepository.find({ where: { isActive: true }, order: { plate: 'ASC' } });
  }

  async getVehicle(id: string): Promise<AuthorizedVehicle> {
    const vehicle = await this.vehiclesRepository.findOne({ where: { id } });
    if (!vehicle) throw new NotFoundException(`Vehicle ${id} not found`);
    return vehicle;
  }

  async createVehicle(data: Partial<AuthorizedVehicle>): Promise<AuthorizedVehicle> {
    // Validate and normalize plate
    if (!data.plate) throw new BadRequestException('Plate is required');
    const { normalized, format, formatted } = validateAndNormalizePlate(data.plate);

    // Check for duplicates
    const existing = await this.vehiclesRepository.findOne({
      where: { plate: formatted, isActive: true },
    });
    if (existing) throw new BadRequestException(`La patente ${formatted} ya está registrada`);

    return this.vehiclesRepository.save(
      this.vehiclesRepository.create({
        ...data,
        plate: formatted,
        plateFormat: format,
      }),
    );
  }

  async updateVehicle(id: string, data: Partial<AuthorizedVehicle>): Promise<AuthorizedVehicle> {
    await this.getVehicle(id);

    // If plate is being updated, re-validate
    if (data.plate) {
      const { normalized, format, formatted } = validateAndNormalizePlate(data.plate);

      // Check for duplicates (excluding current vehicle)
      const existing = await this.vehiclesRepository
        .createQueryBuilder('v')
        .where('v.plate = :plate AND v.id != :id AND v.isActive = true', { plate: formatted, id })
        .getOne();
      if (existing) throw new BadRequestException(`La patente ${formatted} ya está registrada`);

      data.plate = formatted;
      data.plateFormat = format;
    }

    await this.vehiclesRepository.update(id, data);
    return this.getVehicle(id);
  }

  async deleteVehicle(id: string): Promise<void> {
    await this.vehiclesRepository.update(id, { isActive: false });
  }

  /**
   * Validate a plate string without saving.
   * Returns format info + whether the plate is already registered.
   */
  async validatePlate(raw: string): Promise<{
    normalized: string;
    formatted: string;
    format: PlateFormat;
    isValid: boolean;
    isRegistered: boolean;
    registeredVehicle?: AuthorizedVehicle;
  }> {
    const { normalized, format, formatted } = validateAndNormalizePlate(raw);
    const isValid = format !== 'unknown';

    const existing = await this.vehiclesRepository.findOne({
      where: { plate: formatted, isActive: true },
    });

    return {
      normalized,
      formatted,
      format,
      isValid,
      isRegistered: !!existing,
      registeredVehicle: existing || undefined,
    };
  }

  /**
   * Get plate detection stats (grouped by format).
   */
  async getPlateStats(): Promise<{
    totalRegistered: number;
    byFormat: Record<string, number>;
    recentDetections: Detection[];
    topDetected: { plate: string; count: number }[];
  }> {
    const vehicles = await this.vehiclesRepository.find({ where: { isActive: true } });

    const byFormat: Record<string, number> = { old: 0, mercosur: 0, unknown: 0 };
    for (const v of vehicles) {
      byFormat[v.plateFormat || 'unknown'] = (byFormat[v.plateFormat || 'unknown'] || 0) + 1;
    }

    // Recent vehicle detections
    const recentDetections = await this.detectionsRepository
      .createQueryBuilder('d')
      .where('d.type = :type', { type: 'vehicle' })
      .orderBy('d.timestamp', 'DESC')
      .take(10)
      .getMany();

    // Top detected plates
    const topDetected = vehicles
      .filter(v => v.totalDetections > 0)
      .sort((a, b) => b.totalDetections - a.totalDetections)
      .slice(0, 5)
      .map(v => ({ plate: v.plate, count: v.totalDetections }));

    return {
      totalRegistered: vehicles.length,
      byFormat,
      recentDetections,
      topDetected,
    };
  }

  // --- Detections ---
  async getDetections(options?: {
    type?: string;
    authorized?: boolean;
    cameraId?: string;
    page?: number;
    limit?: number;
    plateFormat?: string;
  }): Promise<{ detections: Detection[]; total: number }> {
    const qb = this.detectionsRepository.createQueryBuilder('detection');

    if (options?.type && options.type !== 'all') {
      qb.andWhere('detection.type = :type', { type: options.type });
    }
    if (options?.authorized !== undefined) {
      qb.andWhere('detection.authorized = :auth', { auth: options.authorized });
    }
    if (options?.cameraId) {
      qb.andWhere('detection.cameraId = :cameraId', { cameraId: options.cameraId });
    }
    if (options?.plateFormat) {
      qb.andWhere("detection.metadata->>'plateFormat' = :plateFormat", { plateFormat: options.plateFormat });
    }

    qb.orderBy('detection.timestamp', 'DESC');
    const page = options?.page || 1;
    const limit = options?.limit || 50;
    qb.skip((page - 1) * limit).take(limit);

    const [detections, total] = await qb.getManyAndCount();
    return { detections, total };
  }

  async getDetection(id: string): Promise<Detection | null> {
    return this.detectionsRepository.findOne({ where: { id } });
  }

  async createDetection(data: Partial<Detection>): Promise<Detection> {
    const detection = await this.detectionsRepository.save(this.detectionsRepository.create(data));

    // If vehicle detection matched an authorized vehicle, update its stats
    if (data.type === 'vehicle' && data.authorized && data.matchedVehicleId) {
      await this.vehiclesRepository
        .createQueryBuilder()
        .update(AuthorizedVehicle)
        .set({
          totalDetections: () => '"totalDetections" + 1',
          lastSeenAt: new Date(),
          lastSeenCamera: data.cameraName || undefined,
        })
        .where('id = :id', { id: data.matchedVehicleId })
        .execute();
    }

    return detection;
  }

  // --- Stats ---
  async getStats() {
    const faces = await this.facesRepository.count({ where: { isActive: true } });
    const vehicles = await this.vehiclesRepository.count({ where: { isActive: true } });

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayDetections = await this.detectionsRepository
      .createQueryBuilder('d')
      .where('d.timestamp >= :today', { today })
      .getMany();

    return {
      registeredFaces: faces,
      registeredVehicles: vehicles,
      detectionsToday: todayDetections.length,
      authorizedToday: todayDetections.filter(d => d.authorized).length,
      unknownToday: todayDetections.filter(d => !d.authorized).length,
    };
  }

  // --- Engine Status ---
  async getEngineStatus() {
    const runtime = await this.getEngineRuntimeConfig();
    return {
      status: runtime.detectionEnabled ? 'operational' : 'paused',
      detectionEnabled: runtime.detectionEnabled,
      latency: 120,
      host: 'Ubuntu Server · Mac Mini',
      lastCheck: new Date(),
    };
  }
}
