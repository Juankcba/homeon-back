import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Zone } from './entities/zone.entity';

@Injectable()
export class DevicesService implements OnModuleInit {
  constructor(
    @InjectRepository(Zone)
    private zonesRepository: Repository<Zone>,
  ) {}

  async onModuleInit() {
    const count = await this.zonesRepository.count();
    if (count === 0) {
      await this.zonesRepository.save([
        { name: 'Exterior Frente', floor: 'Exterior', description: 'Entrada principal y jardín frontal' },
        { name: 'Garage', floor: 'Exterior', description: 'Cochera y acceso vehicular' },
        { name: 'Patio Trasero', floor: 'Exterior', description: 'Patio y jardín trasero' },
        { name: 'Interior - Planta Baja', floor: 'PB', description: 'Living, cocina, baño, pasillo' },
        { name: 'Interior - Primer Piso', floor: '1P', description: 'Dormitorios' },
      ]);
      console.log('✅ Default zones seeded (5 zones)');
    }
  }

  async getZones(): Promise<Zone[]> {
    return this.zonesRepository.find({ order: { sortOrder: 'ASC', name: 'ASC' } });
  }

  async createZone(data: Partial<Zone>): Promise<Zone> {
    return this.zonesRepository.save(this.zonesRepository.create(data));
  }

  async updateZone(id: string, data: Partial<Zone>): Promise<Zone | null> {
    await this.zonesRepository.update(id, data);
    return this.zonesRepository.findOne({ where: { id } });
  }

  async deleteZone(id: string): Promise<void> {
    await this.zonesRepository.delete(id);
  }

  async getSystemHealth() {
    // TODO: Implement actual health checks for each device/service
    return {
      backend: { status: 'online', uptime: process.uptime() },
      database: { status: 'online' },
      redis: { status: 'online' },
      cloudflare: { status: 'active' },
      aiEngine: { status: 'operational', latency: 120 },
      system: {
        cpu: Math.round(Math.random() * 30 + 15),
        ram: { used: 4.2, total: 8 },
        disk: Math.round(Math.random() * 20 + 35),
      },
    };
  }

  async getDevicesList() {
    // Aggregated device view
    return [
      { id: '1', name: 'Tapo C320WS - Frente', type: 'camera', ip: '192.168.1.101', status: 'online' },
      { id: '2', name: 'Tapo C310 - Garage', type: 'camera', ip: '192.168.1.102', status: 'online' },
      { id: '3', name: 'Tapo C310 - Patio', type: 'camera', ip: '192.168.1.103', status: 'offline' },
      { id: '4', name: 'Tapo C320WS - Entrada', type: 'camera', ip: '192.168.1.104', status: 'online' },
      { id: '5', name: 'Tapo C310 - Living', type: 'camera', ip: '192.168.1.105', status: 'online' },
      { id: '6', name: 'Tapo C310 - Lateral', type: 'camera', ip: '192.168.1.106', status: 'online' },
      { id: '7', name: 'Hue Bridge', type: 'bridge', ip: '192.168.1.50', status: 'online' },
      { id: '8', name: 'Motor Portón', type: 'gate', ip: '192.168.1.200', status: 'online' },
      { id: '9', name: 'Motor IA (Local)', type: 'ai', ip: '192.168.1.10:5000', status: 'online' },
    ];
  }
}
