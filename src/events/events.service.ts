import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Event, EventSeverity } from './entities/event.entity';

@Injectable()
export class EventsService implements OnModuleInit {
  constructor(
    @InjectRepository(Event)
    private eventsRepository: Repository<Event>,
  ) {}

  async onModuleInit() {
    const count = await this.eventsRepository.count();
    if (count === 0) {
      const now = Date.now();
      await this.eventsRepository.save([
        { type: 'motion', severity: 'warning' as EventSeverity, message: 'Movimiento detectado', detail: 'Zona frontal - Área de entrada', cameraName: 'Frente', timestamp: new Date(now - 2 * 60000) },
        { type: 'face', severity: 'success' as EventSeverity, message: 'Rostro autorizado - Juan', detail: 'Confianza: 98% · Acción: Abrir portón', cameraName: 'Entrada', timestamp: new Date(now - 6 * 60000) },
        { type: 'vehicle', severity: 'success' as EventSeverity, message: 'Vehículo conocido - ABC 123', detail: 'Propietario: Juan · Acción: Notificar', cameraName: 'Garage', timestamp: new Date(now - 19 * 60000) },
        { type: 'unknown_person', severity: 'critical' as EventSeverity, message: 'Persona desconocida detectada', detail: 'Confianza: 72% · Alerta enviada', cameraName: 'Frente', timestamp: new Date(now - 49 * 60000) },
        { type: 'gate', severity: 'info' as EventSeverity, message: 'Portón abierto', detail: 'Método: Reconocimiento facial · Usuario: Ana', timestamp: new Date(now - 79 * 60000) },
        { type: 'gate', severity: 'info' as EventSeverity, message: 'Portón cerrado', detail: 'Método: Automático (3 min timeout)', timestamp: new Date(now - 76 * 60000) },
        { type: 'offline', severity: 'critical' as EventSeverity, message: 'Cámara sin conexión', detail: 'Cámara Patio - Último ping hace 5 min', cameraName: 'Patio', timestamp: new Date(now - 154 * 60000) },
        { type: 'light', severity: 'info' as EventSeverity, message: 'Escena activada: Cine', detail: 'Automatización programada', timestamp: new Date(now - 184 * 60000) },
        { type: 'automation', severity: 'info' as EventSeverity, message: 'Buenos Días ejecutada', detail: 'Luces cocina ON · Escena nocturna OFF', timestamp: new Date(now - 7 * 3600000) },
        { type: 'security', severity: 'warning' as EventSeverity, message: 'Modo seguridad desactivado', detail: 'Usuario: Juan via App', userName: 'Juan', timestamp: new Date(now - 7.1 * 3600000) },
        { type: 'automation', severity: 'info' as EventSeverity, message: 'Escena Nocturna activada', detail: 'Programada a las 21:00', timestamp: new Date(now - 24 * 3600000 + 21 * 3600000) },
        { type: 'vehicle', severity: 'warning' as EventSeverity, message: 'Vehículo desconocido - DEF 456', detail: 'Patente no registrada · Alerta enviada', cameraName: 'Frente', timestamp: new Date(now - 24 * 3600000 + 18 * 3600000) },
      ]);
      console.log('✅ Default events seeded (12 events)');
    }
  }

  async create(data: Partial<Event>): Promise<Event> {
    const event = this.eventsRepository.create(data);
    return this.eventsRepository.save(event);
  }

  async findAll(options?: {
    type?: string;
    severity?: string;
    cameraId?: string;
    search?: string;
    page?: number;
    limit?: number;
  }): Promise<{ events: Event[]; total: number }> {
    const qb = this.eventsRepository.createQueryBuilder('event');

    if (options?.type && options.type !== 'all') {
      qb.andWhere('event.type = :type', { type: options.type });
    }
    if (options?.severity && options.severity !== 'all') {
      qb.andWhere('event.severity = :severity', { severity: options.severity });
    }
    if (options?.cameraId) {
      qb.andWhere('event.cameraId = :cameraId', { cameraId: options.cameraId });
    }
    if (options?.search) {
      qb.andWhere('(event.message ILIKE :search OR event.detail ILIKE :search)', {
        search: `%${options.search}%`,
      });
    }

    qb.orderBy('event.timestamp', 'DESC');

    const page = options?.page || 1;
    const limit = options?.limit || 50;
    qb.skip((page - 1) * limit).take(limit);

    const [events, total] = await qb.getManyAndCount();
    return { events, total };
  }

  async findOne(id: string): Promise<Event | null> {
    return this.eventsRepository.findOne({ where: { id } });
  }

  async acknowledge(id: string): Promise<Event | null> {
    await this.eventsRepository.update(id, { acknowledged: true });
    return this.findOne(id);
  }

  async getStats() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayEvents = await this.eventsRepository
      .createQueryBuilder('event')
      .where('event.timestamp >= :today', { today })
      .getMany();

    return {
      total: todayEvents.length,
      critical: todayEvents.filter(e => e.severity === 'critical').length,
      warning: todayEvents.filter(e => e.severity === 'warning').length,
      success: todayEvents.filter(e => e.severity === 'success').length,
      info: todayEvents.filter(e => e.severity === 'info').length,
      unacknowledged: todayEvents.filter(e => !e.acknowledged).length,
    };
  }
}
