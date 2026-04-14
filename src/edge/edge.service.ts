import { Injectable, NotFoundException, UnauthorizedException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomBytes } from 'crypto';
import { EdgeDevice } from './entities/edge-device.entity';

interface PendingPairing {
  code: string;
  product: string;
  version: string;
  mac: string;
  name: string;
  createdAt: number;
  approvedBy?: string;
  device?: EdgeDevice;
}

@Injectable()
export class EdgeService {
  private readonly logger = new Logger('EdgeService');

  /** In-memory map of short-lived pairing codes. Expires after 10 min. */
  private pending = new Map<string, PendingPairing>();

  constructor(
    @InjectRepository(EdgeDevice)
    private readonly repo: Repository<EdgeDevice>,
  ) {}

  // ─── Pairing ──────────────────────────────────────────────────────────────

  /** Step 1: ESP requests a pairing code. */
  requestPairing(data: { product: string; version?: string; mac: string; name?: string }) {
    // Purge expired entries
    const now = Date.now();
    for (const [c, p] of this.pending) {
      if (now - p.createdAt > 10 * 60 * 1000) this.pending.delete(c);
    }

    const code = this.generateCode();
    this.pending.set(code, {
      code,
      product: data.product,
      version: data.version || '0.0.0',
      mac: data.mac,
      name: data.name || 'HomeOn Edge',
      createdAt: now,
    });

    return {
      code,
      verifyUrl: process.env.EDGE_VERIFY_URL || 'https://homeon.app/link',
      expiresIn: 600,
    };
  }

  /** Step 2: ESP polls with its code. */
  async pollPairingStatus(code: string) {
    const p = this.pending.get(code);
    if (!p) return { paired: false, expired: true };
    if (!p.device) return { paired: false };
    // Device was approved – return token (once), clear entry
    const res = {
      paired: true,
      deviceId: p.device.id,
      token: p.device.token,
    };
    this.pending.delete(code);
    return res;
  }

  /** Step 3: User (JWT) approves pairing from the dashboard. */
  async approvePairing(code: string, approvedBy: string) {
    const p = this.pending.get(code);
    if (!p) throw new NotFoundException('Código inválido o expirado');
    if (p.device) return { alreadyApproved: true };

    // Upsert device
    let device = await this.repo.findOne({ where: { mac: p.mac } });
    const token = this.generateToken();
    if (!device) {
      device = this.repo.create({
        name: p.name,
        product: p.product,
        version: p.version,
        mac: p.mac,
        token,
      });
    } else {
      device.token = token;
      device.name = p.name;
      device.version = p.version;
    }
    device = await this.repo.save(device);
    p.device = device;
    p.approvedBy = approvedBy;
    this.logger.log(`Edge device paired: ${device.name} (${device.mac}) by ${approvedBy}`);
    return { ok: true, deviceId: device.id };
  }

  /** Return all pending pairings so the dashboard can show a "approve" list. */
  listPending() {
    return Array.from(this.pending.values())
      .filter((p) => !p.device)
      .map(({ code, mac, name, product, version, createdAt }) => ({
        code,
        mac,
        name,
        product,
        version,
        createdAt: new Date(createdAt),
      }));
  }

  // ─── Devices ──────────────────────────────────────────────────────────────
  listDevices() {
    return this.repo.find({ order: { createdAt: 'DESC' } });
  }

  async deleteDevice(id: string) {
    const d = await this.repo.findOne({ where: { id } });
    if (!d) throw new NotFoundException('Device not found');
    await this.repo.remove(d);
    return { ok: true };
  }

  async updateLocation(
    id: string,
    data: { locationName: string; latitude: number; longitude: number; timezone?: string },
  ) {
    const d = await this.repo.findOne({ where: { id } });
    if (!d) throw new NotFoundException('Device not found');
    d.locationName = data.locationName;
    d.latitude = data.latitude;
    d.longitude = data.longitude;
    d.timezone = data.timezone || d.timezone || 'America/Argentina/Cordoba';
    await this.repo.save(d);
    return { ok: true, device: d };
  }

  /** Validate a bearer token (used by WS gateway). */
  async authenticateByToken(token: string): Promise<EdgeDevice> {
    const d = await this.repo.findOne({ where: { token } });
    if (!d) throw new UnauthorizedException('Invalid device token');
    return d;
  }

  async updatePresence(id: string, patch: Partial<EdgeDevice>) {
    await this.repo.update(id, { ...patch, lastSeenAt: new Date() });
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────
  private generateCode(): string {
    // 6 chars from A-Z0-9, skip confusing I/O/0/1
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const buf = randomBytes(6);
    let out = '';
    for (let i = 0; i < 6; i++) out += alphabet[buf[i] % alphabet.length];
    return out;
  }

  private generateToken(): string {
    return randomBytes(32).toString('hex');
  }
}
