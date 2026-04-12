/**
 * TuyaService – Integration with Tuya / Smart Life cloud API.
 *
 * Handles authentication, device discovery, and command dispatch for
 * Tuya-based devices (primarily the WiFi alarm system).
 *
 * Tuya Cloud API docs: https://developer.tuya.com/en/docs/cloud
 *
 * Required env vars (or stored in DeviceConfig meta):
 *   TUYA_ACCESS_ID   – Client ID from Tuya IoT Platform
 *   TUYA_ACCESS_SECRET – Client Secret from Tuya IoT Platform
 *   TUYA_REGION       – API region: us | eu | cn | in (default: us)
 */
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import { DeviceConfig } from '../../devices/entities/device-config.entity';

// ─── Types ──────────────────────────────────────────────────────────────────

interface TuyaToken {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  expires_at: number; // epoch ms
}

export interface TuyaDeviceInfo {
  id: string;
  name: string;
  category: string; // 'mal' = alarm, 'mcs' = sensor, etc.
  online: boolean;
  icon: string;
  product_name: string;
  status: TuyaDeviceStatus[];
}

export interface TuyaDeviceStatus {
  code: string;  // e.g. 'master_mode', 'alarm_state', 'switch'
  value: any;
}

export interface TuyaCommandResult {
  success: boolean;
  result?: boolean;
  msg?: string;
}

// ─── Region → Base URL map ──────────────────────────────────────────────────

const REGION_URLS: Record<string, string> = {
  us: 'https://openapi.tuyaus.com',
  eu: 'https://openapi.tuyaeu.com',
  cn: 'https://openapi.tuyacn.com',
  in: 'https://openapi.tuyain.com',
};

const CONFIG_TYPE = 'tuya-cloud';

@Injectable()
export class TuyaService implements OnModuleInit {
  private readonly logger = new Logger(TuyaService.name);

  private accessId = '';
  private accessSecret = '';
  private baseUrl = '';
  private token: TuyaToken | null = null;
  private isConfigured = false;

  constructor(
    @InjectRepository(DeviceConfig)
    private configRepo: Repository<DeviceConfig>,
  ) {}

  // ─── Lifecycle ──────────────────────────────────────────────────────────

  async onModuleInit() {
    await this.loadConfig();
    if (this.isConfigured) {
      try {
        await this.authenticate();
        this.logger.log('TuyaService connected to Tuya Cloud API');
      } catch (err) {
        this.logger.warn(`Tuya auth failed on init: ${err.message}`);
      }
    } else {
      this.logger.log('TuyaService: not configured yet — pair via POST /alarm/tuya/setup');
    }
  }

  // ─── Config persistence ─────────────────────────────────────────────────

  private async loadConfig() {
    // Credentials are stored exclusively in the DB (device_configs table).
    // They are configured via the UI at /dashboard/alarm → Tuya Setup.
    // No .env fallback — we don't want secrets in config files.
    const cfg = await this.configRepo.findOne({ where: { type: CONFIG_TYPE } });

    if (cfg?.apiKey && cfg.meta?.accessSecret) {
      this.accessId = cfg.apiKey;
      this.accessSecret = cfg.meta.accessSecret;
      const region = (cfg.meta.region as string) || 'us';
      this.baseUrl = REGION_URLS[region] || REGION_URLS.us;
      this.isConfigured = true;
    }
  }

  async saveConfig(accessId: string, accessSecret: string, region = 'us') {
    let cfg = await this.configRepo.findOne({ where: { type: CONFIG_TYPE } });
    if (cfg) {
      cfg.apiKey = accessId;
      cfg.meta = { ...cfg.meta, accessSecret, region };
      await this.configRepo.save(cfg);
    } else {
      cfg = await this.configRepo.save(
        this.configRepo.create({
          type: CONFIG_TYPE,
          label: 'Tuya / Smart Life',
          ip: '',
          apiKey: accessId,
          meta: { accessSecret, region },
          connected: false,
        }),
      );
    }

    this.accessId = accessId;
    this.accessSecret = accessSecret;
    this.baseUrl = REGION_URLS[region] || REGION_URLS.us;
    this.isConfigured = true;

    // Test connection
    try {
      await this.authenticate();
      await this.configRepo.update(cfg.id, { connected: true });
      return { success: true, message: 'Connected to Tuya Cloud API' };
    } catch (err) {
      await this.configRepo.update(cfg.id, { connected: false });
      return { success: false, message: err.message };
    }
  }

  getStatus() {
    return {
      configured: this.isConfigured,
      connected: !!this.token && this.token.expires_at > Date.now(),
      region: this.baseUrl ? new URL(this.baseUrl).hostname : null,
    };
  }

  // ─── Tuya Cloud Auth (HMAC-SHA256 signature) ───────────────────────────
  // Spec: https://developer.tuya.com/en/docs/iot/new-singnature?id=Kbw0q34cs2e5g
  //
  // Token request sign:  HMAC-SHA256(clientId + t + stringToSign, secret)
  // Business request sign: HMAC-SHA256(clientId + access_token + t + stringToSign, secret)
  // stringToSign = method + "\n" + sha256(body) + "\n" + headers + "\n" + url

  private async authenticate(): Promise<void> {
    const timestamp = Date.now().toString();
    const nonce = '';
    const method = 'GET';
    const url = '/v1.0/token?grant_type=1';
    const body = '';

    // stringToSign = METHOD\nsha256(body)\n\nurl
    const contentHash = crypto.createHash('sha256').update(body).digest('hex');
    const stringToSign = [method, contentHash, '', url].join('\n');

    // For token request: sign = HMAC(clientId + t + nonce + stringToSign)
    const signStr = this.accessId + timestamp + nonce + stringToSign;
    const sign = crypto
      .createHmac('sha256', this.accessSecret)
      .update(signStr)
      .digest('hex')
      .toUpperCase();

    const fullUrl = `${this.baseUrl}${url}`;
    const headers: Record<string, string> = {
      client_id: this.accessId,
      sign,
      t: timestamp,
      sign_method: 'HMAC-SHA256',
      nonce,
    };

    this.logger.debug(`Auth request → ${fullUrl}`);
    const res = await fetch(fullUrl, { headers });
    const data = await res.json();

    if (!data.success) {
      throw new Error(`Tuya auth failed: ${data.msg || data.code}`);
    }

    this.token = {
      access_token: data.result.access_token,
      refresh_token: data.result.refresh_token,
      expires_in: data.result.expire_time,
      expires_at: Date.now() + data.result.expire_time * 1000 - 60_000,
    };
    this.logger.debug('Tuya auth OK — token acquired');
  }

  private async ensureAuth(): Promise<void> {
    if (!this.isConfigured) {
      throw new Error('Tuya not configured — call POST /alarm/tuya/setup first');
    }
    if (!this.token || this.token.expires_at <= Date.now()) {
      await this.authenticate();
    }
  }

  // ─── API requests ─────────────────────────────────────────────────────

  private async apiRequest<T = any>(
    method: string,
    path: string,
    body?: Record<string, any>,
  ): Promise<T> {
    await this.ensureAuth();

    const timestamp = Date.now().toString();
    const nonce = '';
    const bodyStr = body ? JSON.stringify(body) : '';

    // stringToSign = METHOD\nsha256(body)\n\nurl
    const contentHash = crypto.createHash('sha256').update(bodyStr).digest('hex');
    const stringToSign = [method, contentHash, '', path].join('\n');

    // For business requests: sign = HMAC(clientId + access_token + t + nonce + stringToSign)
    const signStr = this.accessId + this.token!.access_token + timestamp + nonce + stringToSign;
    const sign = crypto
      .createHmac('sha256', this.accessSecret)
      .update(signStr)
      .digest('hex')
      .toUpperCase();

    const headers: Record<string, string> = {
      client_id: this.accessId,
      access_token: this.token!.access_token,
      sign,
      t: timestamp,
      sign_method: 'HMAC-SHA256',
      nonce,
      'Content-Type': 'application/json',
    };

    const url = `${this.baseUrl}${path}`;
    const res = await fetch(url, {
      method,
      headers,
      body: bodyStr || undefined,
    });

    const data = await res.json();
    if (!data.success) {
      throw new Error(`Tuya API error: ${data.msg} (code: ${data.code})`);
    }

    return data.result as T;
  }

  // ─── Device operations ────────────────────────────────────────────────

  /** List all devices linked to the Tuya cloud project.
   *  Tries multiple API endpoints because the available one depends on
   *  the project type and how devices were linked. */
  async getDevices(): Promise<TuyaDeviceInfo[]> {
    // Strategy 1: Associated user devices (works when Smart Life account is linked)
    try {
      const result = await this.apiRequest<{ list?: TuyaDeviceInfo[]; devices?: TuyaDeviceInfo[] }>(
        'GET',
        '/v1.0/iot-01/associated-users/devices',
      );
      const list = result?.list || result?.devices || [];
      if (list.length > 0) {
        this.logger.debug(`Found ${list.length} devices via associated-users`);
        return list;
      }
    } catch (err) {
      this.logger.debug(`associated-users endpoint failed: ${err.message}`);
    }

    // Strategy 2: Get linked users first, then their devices
    try {
      const users = await this.apiRequest<{ list: { uid: string }[] }>(
        'GET',
        '/v1.0/iot-01/associated-users',
      );
      const allDevices: TuyaDeviceInfo[] = [];
      for (const user of users?.list || []) {
        try {
          const devicesResult = await this.apiRequest<TuyaDeviceInfo[]>(
            'GET',
            `/v1.0/users/${user.uid}/devices`,
          );
          if (Array.isArray(devicesResult)) {
            allDevices.push(...devicesResult);
          }
        } catch {}
      }
      if (allDevices.length > 0) {
        this.logger.debug(`Found ${allDevices.length} devices via user UIDs`);
        return allDevices;
      }
    } catch (err) {
      this.logger.debug(`associated-users UID lookup failed: ${err.message}`);
    }

    // Strategy 3: Direct device list (some project types)
    try {
      const result = await this.apiRequest<{ list: TuyaDeviceInfo[]; total: number }>(
        'GET',
        '/v1.0/devices?page_no=1&page_size=100',
      );
      const list = result?.list || [];
      this.logger.debug(`Found ${list.length} devices via direct device list`);
      return list;
    } catch (err) {
      this.logger.debug(`Direct device list failed: ${err.message}`);
    }

    this.logger.warn('No devices found via any Tuya API endpoint');
    return [];
  }

  /** Get specific device info + current status */
  async getDeviceInfo(deviceId: string): Promise<TuyaDeviceInfo> {
    return this.apiRequest<TuyaDeviceInfo>('GET', `/v1.0/devices/${deviceId}`);
  }

  /** Get current status DPs for a device */
  async getDeviceStatus(deviceId: string): Promise<TuyaDeviceStatus[]> {
    return this.apiRequest<TuyaDeviceStatus[]>(
      'GET',
      `/v1.0/devices/${deviceId}/status`,
    );
  }

  /** Send commands to a device (set DPs) */
  async sendCommand(
    deviceId: string,
    commands: { code: string; value: any }[],
  ): Promise<TuyaCommandResult> {
    const result = await this.apiRequest<boolean>(
      'POST',
      `/v1.0/devices/${deviceId}/commands`,
      { commands },
    );
    return { success: true, result };
  }

  // ─── Alarm-specific helpers ───────────────────────────────────────────

  /**
   * Alarm modes for generic Tuya WiFi alarm panels.
   * DP code: 'master_mode'
   * Values: 'arm' | 'disarm' | 'home' | 'sos'
   */
  async setAlarmMode(deviceId: string, mode: 'arm' | 'disarm' | 'home' | 'sos') {
    return this.sendCommand(deviceId, [{ code: 'master_mode', value: mode }]);
  }

  /** Get alarm panel status including mode, sensors, battery */
  async getAlarmStatus(deviceId: string) {
    const statuses = await this.getDeviceStatus(deviceId);
    const statusMap: Record<string, any> = {};
    for (const s of statuses) {
      statusMap[s.code] = s.value;
    }

    return {
      mode: statusMap['master_mode'] || 'unknown',
      alarmActive: statusMap['alarm_state'] === true,
      alarmSound: statusMap['alarm_volume'] ?? null,
      battery: statusMap['battery_percentage'] ?? null,
      tamper: statusMap['temper_alarm'] === true,
      statuses,
    };
  }

  /** Trigger or stop the siren manually */
  async triggerSiren(deviceId: string, active: boolean) {
    return this.sendCommand(deviceId, [{ code: 'alarm_state', value: active }]);
  }

  // ─── Health check ─────────────────────────────────────────────────────

  async checkHealth(): Promise<{ connected: boolean; message: string }> {
    if (!this.isConfigured) {
      return { connected: false, message: 'Not configured' };
    }
    try {
      await this.ensureAuth();
      return { connected: true, message: 'Tuya Cloud API reachable' };
    } catch (err) {
      return { connected: false, message: err.message };
    }
  }
}
