import { Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Automation } from './entities/automation.entity';

@Injectable()
export class AutomationsService implements OnModuleInit {
  constructor(
    @InjectRepository(Automation)
    private automationsRepository: Repository<Automation>,
  ) {}

  async onModuleInit() {
    const count = await this.automationsRepository.count();
    if (count === 0) {
      await this.automationsRepository.save([
        {
          name: 'Bienvenida Nocturna',
          description: 'Cuando llego de noche, prender luces exteriores y abrir portón',
          trigger: { type: 'face_recognized', config: { timeRange: { from: '19:00', to: '06:00' } } },
          actions: [
            { type: 'turn_on_light', config: { group: 'Exterior Frente' } },
            { type: 'open_gate', config: {} },
          ],
          enabled: true,
          lastRunAt: new Date(Date.now() - 3 * 3600000),
          runCount: 45,
        },
        {
          name: 'Escena Nocturna',
          description: 'A las 21:00 activar luces tenues y modo seguridad',
          trigger: { type: 'schedule', config: { cron: '0 21 * * *', label: 'Todos los días a las 21:00' } },
          actions: [
            { type: 'set_scene', config: { sceneName: 'Nocturna' } },
            { type: 'activate_alarm', config: {} },
          ],
          enabled: true,
          lastRunAt: new Date(Date.now() - 24 * 3600000 + 21 * 3600000),
          runCount: 120,
        },
        {
          name: 'Alerta Desconocido',
          description: 'Si se detecta persona desconocida, notificar y grabar',
          trigger: { type: 'face_unknown', config: {} },
          actions: [
            { type: 'send_notification', config: { channel: 'push', message: 'Persona desconocida detectada' } },
            { type: 'record_event', config: {} },
            { type: 'activate_alarm', config: {} },
          ],
          enabled: true,
          lastRunAt: new Date(Date.now() - 49 * 60000),
          runCount: 8,
        },
        {
          name: 'Vehículo Conocido',
          description: 'Al detectar patente autorizada, abrir portón automáticamente',
          trigger: { type: 'vehicle_recognized', config: {} },
          actions: [
            { type: 'open_gate', config: {} },
            { type: 'send_notification', config: { channel: 'push', message: 'Vehículo autorizado llegó' } },
          ],
          enabled: false,
          lastRunAt: new Date(Date.now() - 2 * 24 * 3600000),
          runCount: 15,
        },
        {
          name: 'Buenos Días',
          description: 'A las 7:30 apagar luces nocturnas y encender cocina',
          trigger: { type: 'schedule', config: { cron: '30 7 * * 1-5', label: 'Lunes a Viernes a las 7:30' } },
          actions: [
            { type: 'turn_off_light', config: { scene: 'Nocturna' } },
            { type: 'turn_on_light', config: { group: 'Cocina', brightness: 254 } },
          ],
          enabled: true,
          lastRunAt: new Date(Date.now() - 7 * 3600000),
          runCount: 89,
        },
      ]);
      console.log('✅ Default automations seeded (5 rules)');
    }
  }

  async findAll(): Promise<Automation[]> {
    return this.automationsRepository.find({ order: { sortOrder: 'ASC', name: 'ASC' } });
  }

  async findOne(id: string): Promise<Automation> {
    const auto = await this.automationsRepository.findOne({ where: { id } });
    if (!auto) throw new NotFoundException(`Automation ${id} not found`);
    return auto;
  }

  async create(data: Partial<Automation>): Promise<Automation> {
    return this.automationsRepository.save(this.automationsRepository.create(data));
  }

  async update(id: string, data: Partial<Automation>): Promise<Automation> {
    await this.findOne(id);
    await this.automationsRepository.update(id, data);
    return this.findOne(id);
  }

  async toggle(id: string): Promise<Automation> {
    const auto = await this.findOne(id);
    await this.automationsRepository.update(id, { enabled: !auto.enabled });
    return this.findOne(id);
  }

  async remove(id: string): Promise<void> {
    await this.automationsRepository.delete(id);
  }

  async execute(id: string): Promise<boolean> {
    const auto = await this.findOne(id);
    if (!auto.enabled) return false;

    // TODO: Execute actual automation actions
    await this.automationsRepository.update(id, {
      lastRunAt: new Date(),
      runCount: auto.runCount + 1,
    });
    return true;
  }

  async getStats() {
    const automations = await this.findAll();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return {
      total: automations.length,
      active: automations.filter(a => a.enabled).length,
      paused: automations.filter(a => !a.enabled).length,
      executionsToday: 14, // TODO: Track from execution log
    };
  }
}
