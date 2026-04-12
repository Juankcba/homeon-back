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

  /** Get the specification/functions of a device (what DPs it supports) */
  async getDeviceFunctions(deviceId: string): Promise<any> {
    try {
      return await this.apiRequest('GET', `/v1.0/devices/${deviceId}/functions`);
    } catch (err) {
      this.logger.debug(`Functions endpoint failed: ${err.message}`);
      return null;
    }
  }

  /** Get device specification (DPs schema) */
  async getDeviceSpecification(deviceId: string): Promise<any> {
    try {
      return await this.apiRequest('GET', `/v1.0/devices/${deviceId}/specifications`);
    } catch (err) {
      this.logger.debug(`Specifications endpoint failed: ${err.message}`);
      return null;
    }
  }

  /** Get sub-devices of a gateway (sensors, sirens, etc.) */
  async getSubDevices(gatewayId: string): Promise<TuyaDeviceInfo[]> {
    try {
      const result = await this.apiRequest<TuyaDeviceInfo[]>(
        'GET',
        `/v1.0/devices/${gatewayId}/sub-devices`,
      );
      return Array.isArray(result) ? result : [];
    } catch (err) {
      this.logger.debug(`Sub-devices endpoint failed: ${err.message}`);
      return [];
    }
  }

  /** Get a full diagnostic dump for a device — used to discover DPs */
  async getDeviceDiagnostic(deviceId: string): Promise<Record<string, any>> {
    const [info, status, functions, spec, subDevices] = await Promise.allSettled([
      this.getDeviceInfo(deviceId),
      this.getDeviceStatus(deviceId).catch(() => []),
      this.getDeviceFunctions(deviceId),
      this.getDeviceSpecification(deviceId),
      this.getSubDevices(deviceId),
    ]);

    return {
      info: info.status === 'fulfilled' ? info.value : null,
      status: status.status === 'fulfilled' ? status.value : [],
      functions: functions.status === 'fulfilled' ? functions.value : null,
      specification: spec.status === 'fulfilled' ? spec.value : null,
      subDevices: subDevices.status === 'fulfilled' ? subDevices.value : [],
    };
  }

  // ─── Alarm-specific helpers ───────────────────────────────────────────

  /**
   * Set alarm mode. Tries multiple DP codes since different models use
   * different codes: master_mode, switch_alarm, alarm_switch, etc.
   */
  async setAlarmMode(deviceId: string, mode: 'arm' | 'disarm' | 'home' | 'sos') {
    // Try the known DP codes for alarm gateways
    const codesToTry = ['master_mode', 'switch_alarm', 'alarm_state_mode'];
    let lastError: Error | null = null;

    for (const code of codesToTry) {
      try {
        const result = await this.sendCommand(deviceId, [{ code, value: mode }]);
        this.logger.debug(`Alarm mode set via DP code: ${code} = ${mode}`);
        return result;
      } catch (err) {
        lastError = err;
        this.logger.debug(`DP code '${code}' failed: ${err.message}`);
      }
    }

    // If string modes fail, try boolean (some use switch_alarm = true/false)
    if (mode === 'arm' || mode === 'disarm') {
      try {
        const result = await this.sendCommand(deviceId, [
          { code: 'switch_alarm', value: mode === 'arm' },
        ]);
        this.logger.debug(`Alarm mode set via boolean switch_alarm = ${mode === 'arm'}`);
        return result;
      } catch (err) {
        lastError = err;
      }
    }

    throw lastError || new Error('Could not set alarm mode — no compatible DP found');
  }

  /** Get alarm panel status — handles gateways that may not have standard DPs */
  async getAlarmStatus(deviceId: string) {
    let statuses: TuyaDeviceStatus[] = [];
    try {
      statuses = await this.getDeviceStatus(deviceId);
    } catch (err) {
      this.logger.debug(`getDeviceStatus failed for ${deviceId}: ${err.message}`);
    }

    const statusMap: Record<string, any> = {};
    for (const s of statuses) {
      statusMap[s.code] = s.value;
    }

    // Detect mode from various possible DP codes
    const mode =
      statusMap['master_mode'] ||
      statusMap['alarm_state_mode'] ||
      (statusMap['switch_alarm'] === true ? 'arm' : statusMap['switch_alarm'] === false ? 'disarm' : null) ||
      'unknown';

    return {
      mode,
      alarmActive:
        statusMap['alarm_state'] === true ||
        statusMap['alarm_active'] === true ||
        statusMap['alarm_msg'] !== undefined,
      alarmSound: statusMap['alarm_volume'] ?? statusMap['alarm_ringtone'] ?? null,
      battery: statusMap['battery_percentage'] ?? statusMap['va_battery'] ?? null,
      tamper: statusMap['temper_alarm'] === true,
      statuses,
    };
  }

  /** Trigger or stop the siren manually */
  async triggerSiren(deviceId: string, active: boolean) {
    // Try multiple known siren DP codes
    const codesToTry = ['alarm_state', 'alarm_active', 'muffling'];
    for (const code of codesToTry) {
      try {
        return await this.sendCommand(deviceId, [{ code, value: active }]);
      } catch {}
    }
    throw new Error('Could not control siren — no compatible DP found');
  }

  // ─── Local control via AI engine (tinytuya) ────────────────────────────
  // The Python AI service runs on the same LAN as Tuya devices and exposes
  // a local HTTP API on port 5001 for direct device control.

  private get aiLocalUrl(): string {
    // AI engine runs on host network, same as backend
    return 'http://127.0.0.1:5001';
  }

  private get aiApiKey(): string {
    return process.env.AI_API_KEY || 'homeon-ai-secret-2026';
  }

  /** Send a command to the local Tuya API (via AI engine) */
  async localRequest(path: string, body: Record<string, any>): Promise<any> {
    const res = await fetch(`${this.aiLocalUrl}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-AI-Key': this.aiApiKey,
      },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (res.status !== 200) {
      throw new Error(data.error || `Local Tuya API error: ${res.status}`);
    }
    return data;
  }

  /** Get status via local LAN connection */
  async getLocalStatus(deviceId: string, localKey: string, ip: string): Promise<any> {
    return this.localRequest('/tuya/status', { device_id: deviceId, local_key: localKey, ip });
  }

  /** Scan device DPs via local LAN */
  async scanLocalDevice(deviceId: string, localKey: string, ip: string): Promise<any> {
    return this.localRequest('/tuya/scan', { device_id: deviceId, local_key: localKey, ip });
  }

  /** Set alarm mode via local LAN */
  async setLocalAlarmMode(deviceId: string, localKey: string, ip: string, mode: string): Promise<any> {
    return this.localRequest('/tuya/mode', { device_id: deviceId, local_key: localKey, ip, mode });
  }

  /** Control siren via local LAN */
  async setLocalSiren(deviceId: string, localKey: string, ip: string, active: boolean): Promise<any> {
    return this.localRequest('/tuya/siren', { device_id: deviceId, local_key: localKey, ip, active });
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
