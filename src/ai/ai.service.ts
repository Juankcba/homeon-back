import { Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthorizedFace } from './entities/authorized-face.entity';
import { AuthorizedVehicle } from './entities/authorized-vehicle.entity';
import { Detection } from './entities/detection.entity';

@Injectable()
export class AiService implements OnModuleInit {
  constructor(
    @InjectRepository(AuthorizedFace)
    private facesRepository: Repository<AuthorizedFace>,
    @InjectRepository(AuthorizedVehicle)
    private vehiclesRepository: Repository<AuthorizedVehicle>,
    @InjectRepository(Detection)
    private detectionsRepository: Repository<Detection>,
  ) {}

  async onModuleInit() {
    const faceCount = await this.facesRepository.count();
    if (faceCount === 0) {
      await this.facesRepository.save([
        { name: 'Juan', role: 'admin', totalDetections: 45, avgConfidence: 98, lastSeenAt: new Date(Date.now() - 2 * 3600000), lastSeenCamera: 'Entrada', gateAccess: true },
        { name: 'Ana', role: 'family', totalDetections: 32, avgConfidence: 96, lastSeenAt: new Date(Date.now() - 5 * 3600000), lastSeenCamera: 'Frente', gateAccess: true },
        { name: 'Carlos', role: 'family', totalDetections: 12, avgConfidence: 94, lastSeenAt: new Date(Date.now() - 24 * 3600000), lastSeenCamera: 'Garage', gateAccess: true },
      ]);

      await this.vehiclesRepository.save([
        { plate: 'ABC 123', owner: 'Juan', type: 'auto', brand: 'Toyota', model: 'Corolla', color: 'Blanco', totalDetections: 28, lastSeenAt: new Date(Date.now() - 3 * 3600000), lastSeenCamera: 'Garage', gateAccess: true },
        { plate: 'XYZ 789', owner: 'Ana', type: 'auto', brand: 'Ford', model: 'Focus', color: 'Gris', totalDetections: 15, lastSeenAt: new Date(Date.now() - 24 * 3600000), lastSeenCamera: 'Frente', gateAccess: true },
      ]);

      await this.detectionsRepository.save([
        { type: 'face', label: 'Juan', cameraId: '1', cameraName: 'Entrada', confidence: 98, authorized: true, timestamp: new Date(Date.now() - 2 * 60000) },
        { type: 'vehicle', label: 'ABC 123', cameraId: '2', cameraName: 'Garage', confidence: 95, authorized: true, timestamp: new Date(Date.now() - 19 * 60000) },
        { type: 'face', label: 'Desconocido', cameraId: '1', cameraName: 'Frente', confidence: 72, authorized: false, timestamp: new Date(Date.now() - 49 * 60000) },
        { type: 'face', label: 'Ana', cameraId: '4', cameraName: 'Entrada', confidence: 96, authorized: true, timestamp: new Date(Date.now() - 79 * 60000) },
        { type: 'vehicle', label: 'DEF 456', cameraId: '1', cameraName: 'Frente', confidence: 88, authorized: false, timestamp: new Date(Date.now() - 154 * 60000) },
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
    return this.vehiclesRepository.save(this.vehiclesRepository.create(data));
  }

  async updateVehicle(id: string, data: Partial<AuthorizedVehicle>): Promise<AuthorizedVehicle> {
    await this.getVehicle(id);
    await this.vehiclesRepository.update(id, data);
    return this.getVehicle(id);
  }

  async deleteVehicle(id: string): Promise<void> {
    await this.vehiclesRepository.update(id, { isActive: false });
  }

  // --- Detections ---
  async getDetections(options?: {
    type?: string;
    authorized?: boolean;
    cameraId?: string;
    page?: number;
    limit?: number;
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
    return this.detectionsRepository.save(this.detectionsRepository.create(data));
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
    // TODO: Check actual AI engine health
    return {
      status: 'operational',
      latency: 120,
      host: 'Ubuntu Server · Mac Mini',
      lastCheck: new Date(),
    };
  }
}
