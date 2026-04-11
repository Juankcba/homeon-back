import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { DeviceConfig } from '../../devices/entities/device-config.entity';

/**
 * HueService — Real integration with Philips Hue Bridge.
 *
 * Bridge config (IP + API key) is stored in the `device_configs` table,
 * NOT in .env. The .env values are used only as initial fallback.
 *
 * Flow to connect:
 *  1. POST /lights/hue/discover → finds bridge IP
 *  2. POST /lights/hue/pair    → user presses link button, then calls this
 *  3. POST /lights/hue/sync    → pulls lights/groups/scenes from bridge into DB
 */

export interface HueLightState {
  on: boolean;
  bri: number;
  hue?: number;
  sat?: number;
  ct?: number;
  xy?: [number, number];
  effect?: 'none' | 'colorloop';
  alert?: 'none' | 'select' | 'lselect';
  transitiontime?: number;
  reachable?: boolean;
}

export interface HueLight {
  id: string;
  name: string;
  type: string;
  modelid: string;
  uniqueid: string;
  state: HueLightState;
  swversion: string;
}

export interface HueGroup {
  id: string;
  name: string;
  type: string;
  lights: string[];
  state: { all_on: boolean; any_on: boolean };
  action: HueLightState;
}

export interface HueScene {
  id: string;
  name: string;
  type: string;
  group: string;
  lights: string[];
}

export interface HueBridgeConfig {
  name: string;
  modelid: string;
  bridgeid: string;
  mac: string;
  ipaddress: string;
  swversion: string;
  apiversion: string;
  zigbeechannel: number;
}

const CONFIG_TYPE = 'hue-bridge';

@Injectable()
export class HueService implements OnModuleInit {
  private readonly logger = new Logger(HueService.name);
  private bridgeIp = '';
  private apiKey = '';
  private baseUrl = '';
  private isConnected = false;

  constructor(
    @InjectRepository(DeviceConfig)
    private deviceConfigRepo: Repository<DeviceConfig>,
    private configService: ConfigService,
  ) {}

  async onModuleInit() {
    await this.loadConfig();
    if (this.apiKey) {
      await this.testConnection();
    } else {
      this.logger.warn('Hue Bridge not paired yet — use /lights/hue/pair');
    }
  }

  // ─── Config management (DB-backed) ─────────────────────────

  /** Load bridge config from DB, fallback to .env for first setup */
  private async loadConfig() {
    let cfg = await this.deviceConfigRepo.findOne({ where: { type: CONFIG_TYPE } });

    if (!cfg) {
      // First run — seed from .env if available
      const envIp = this.configService.get('HUE_BRIDGE_IP', '');
      const envKey = this.configService.get('HUE_API_KEY', '');
      if (envIp) {
        cfg = await this.deviceConfigRepo.save({
          type: CONFIG_TYPE,
          label: 'Philips Hue Bridge',
          ip: envIp,
          apiKey: envKey || null,
          meta: {},
          connected: false,
        });
        this.logger.log(`Seeded Hue config from .env (IP=${envIp})`);
      }
    }

    if (cfg) {
      this.bridgeIp = cfg.ip || '';
      this.apiKey = cfg.apiKey || '';
      this.baseUrl = this.apiKey
        ? `http://${this.bridgeIp}/api/${this.apiKey}`
        : '';
      this.logger.log(`Hue config loaded — IP: ${this.bridgeIp}, API key: ${this.apiKey ? 'YES' : 'NO'}`);
    }
  }

  /** Save bridge config to DB */
  private async saveConfig(partial: Partial<{ ip: string; apiKey: string; connected: boolean; meta: Record<string, any> }>) {
    let cfg = await this.deviceConfigRepo.findOne({ where: { type: CONFIG_TYPE } });
    if (!cfg) {
      cfg = this.deviceConfigRepo.create({ type: CONFIG_TYPE, label: 'Philips Hue Bridge', meta: {} });
    }
    if (partial.ip !== undefined) cfg.ip = partial.ip;
    if (partial.apiKey !== undefined) cfg.apiKey = partial.apiKey;
    if (partial.connected !== undefined) cfg.connected = partial.connected;
    if (partial.meta) cfg.meta = { ...cfg.meta, ...partial.meta };
    await this.deviceConfigRepo.save(cfg);

    // Update in-memory state
    this.bridgeIp = cfg.ip || '';
    this.apiKey = cfg.apiKey || '';
    this.baseUrl = this.apiKey ? `http://${this.bridgeIp}/api/${this.apiKey}` : '';
    this.isConnected = cfg.connected;
  }

  // ─── Discovery & Pairing ────────────────────────────────────

  /**
   * Discover Hue Bridge on the network.
   * Returns found IP or null.
   */
  async discoverBridge(): Promise<{ ip: string | null; source: string }> {
    // 1. Try the Hue cloud discovery endpoint
    try {
      const response = await fetch('https://discovery.meethue.com/', {
        signal: AbortSignal.timeout(10000),
      });
      const bridges = await response.json();
      if (Array.isArray(bridges) && bridges.length > 0) {
        const ip = bridges[0].internalipaddress;
        await this.saveConfig({ ip });
        this.logger.log(`Discovered Hue Bridge via cloud: ${ip}`);
        return { ip, source: 'cloud' };
      }
    } catch {
      this.logger.debug('Cloud discovery failed');
    }

    // 2. Try the IP we already have
    if (this.bridgeIp) {
      const reachable = await this.pingBridge(this.bridgeIp);
      if (reachable) {
        return { ip: this.bridgeIp, source: 'saved' };
      }
    }

    return { ip: null, source: 'none' };
  }

  /** Quick ping to check if a bridge is responding */
  async pingBridge(ip: string): Promise<boolean> {
    try {
      const res = await fetch(`http://${ip}/api`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ devicetype: 'homeon#test' }),
        signal: AbortSignal.timeout(5000),
      });
      const data = await res.json();
      // If we get any JSON response back (even an error), the bridge is there
      return Array.isArray(data);
    } catch {
      return false;
    }
  }

  /**
   * Set the bridge IP (used when user provides it manually).
   */
  async setBridgeIp(ip: string): Promise<boolean> {
    const reachable = await this.pingBridge(ip);
    await this.saveConfig({ ip });
    return reachable;
  }

  /**
   * Pair with the bridge — user must press the link button first.
   * Returns the API key on success, or an error message.
   */
  async pair(): Promise<{ success: boolean; apiKey?: string; error?: string }> {
    if (!this.bridgeIp) {
      return { success: false, error: 'No bridge IP configured. Run discover first.' };
    }

    try {
      const response = await fetch(`http://${this.bridgeIp}/api`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ devicetype: 'homeon#backend' }),
        signal: AbortSignal.timeout(10000),
      });
      const data = await response.json();

      if (Array.isArray(data) && data[0]?.success?.username) {
        const key = data[0].success.username;
        await this.saveConfig({ apiKey: key, connected: true });

        // Fetch bridge info and store as meta
        try {
          const configRes = await fetch(`http://${this.bridgeIp}/api/${key}/config`, {
            signal: AbortSignal.timeout(5000),
          });
          const bridgeInfo = await configRes.json();
          await this.saveConfig({
            meta: {
              name: bridgeInfo.name,
              model: bridgeInfo.modelid,
              bridgeId: bridgeInfo.bridgeid,
              mac: bridgeInfo.mac,
              swVersion: bridgeInfo.swversion,
            },
          });
        } catch { /* non-critical */ }

        this.logger.log(`Paired with Hue Bridge! API key: ${key}`);
        return { success: true, apiKey: key };
      }

      if (Array.isArray(data) && data[0]?.error) {
        const err = data[0].error;
        // error type 101 = link button not pressed
        if (err.type === 101) {
          return { success: false, error: 'Presioná el botón del Hue Bridge y volvé a intentar.' };
        }
        return { success: false, error: err.description };
      }

      return { success: false, error: 'Respuesta inesperada del Bridge' };
    } catch (error) {
      return { success: false, error: `No se pudo conectar al Bridge: ${error.message}` };
    }
  }

  // ─── Connection test ────────────────────────────────────────

  async testConnection(): Promise<boolean> {
    if (!this.baseUrl) {
      this.isConnected = false;
      return false;
    }
    try {
      const response = await fetch(`${this.baseUrl}/config`, {
        signal: AbortSignal.timeout(5000),
      });
      if (response.ok) {
        const data = await response.json();
        if (data.name) {
          this.isConnected = true;
          await this.saveConfig({ connected: true });
          this.logger.log(`Connected to Hue Bridge: ${data.name} (${data.modelid})`);
          return true;
        }
      }
      this.isConnected = false;
      await this.saveConfig({ connected: false });
      return false;
    } catch (error) {
      this.isConnected = false;
      await this.saveConfig({ connected: false });
      this.logger.warn(`Cannot connect to Hue Bridge at ${this.bridgeIp}: ${error.message}`);
      return false;
    }
  }

  // ─── Bridge config ──────────────────────────────────────────

  async getBridgeConfig(): Promise<HueBridgeConfig | null> {
    if (!this.baseUrl) return null;
    try {
      const response = await fetch(`${this.baseUrl}/config`, {
        signal: AbortSignal.timeout(5000),
      });
      return await response.json();
    } catch {
      return null;
    }
  }

  // ─── LIGHTS ─────────────────────────────────────────────────

  async getAllLights(): Promise<HueLight[]> {
    if (!this.baseUrl) return [];
    try {
      const response = await fetch(`${this.baseUrl}/lights`, {
        signal: AbortSignal.timeout(5000),
      });
      const data = await response.json();
      if (data && typeof data === 'object' && !Array.isArray(data)) {
        return Object.entries(data).map(([id, light]: [string, any]) => ({
          id,
          name: light.name,
          type: light.type,
          modelid: light.modelid,
          uniqueid: light.uniqueid,
          state: light.state,
          swversion: light.swversion,
        }));
      }
      return [];
    } catch (error) {
      this.logger.error(`Failed to get lights: ${error.message}`);
      return [];
    }
  }

  async getLight(hueId: string): Promise<HueLight | null> {
    if (!this.baseUrl) return null;
    try {
      const response = await fetch(`${this.baseUrl}/lights/${hueId}`, {
        signal: AbortSignal.timeout(5000),
      });
      const data = await response.json();
      return { id: hueId, ...data };
    } catch {
      return null;
    }
  }

  async setLightState(hueId: string, state: Partial<HueLightState>): Promise<boolean> {
    if (!this.baseUrl) {
      this.logger.warn('Hue not connected — cannot set light state');
      return false;
    }
    try {
      const response = await fetch(`${this.baseUrl}/lights/${hueId}/state`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(state),
        signal: AbortSignal.timeout(5000),
      });
      const data = await response.json();
      return Array.isArray(data) && data.every((r: any) => r.success);
    } catch (error) {
      this.logger.error(`Failed to set light ${hueId} state: ${error.message}`);
      return false;
    }
  }

  async toggleLight(hueId: string): Promise<boolean> {
    const light = await this.getLight(hueId);
    if (!light) return false;
    return this.setLightState(hueId, { on: !light.state.on });
  }

  async setBrightness(hueId: string, brightness: number): Promise<boolean> {
    const bri = Math.max(1, Math.min(254, brightness));
    return this.setLightState(hueId, { on: true, bri });
  }

  async setColor(hueId: string, hue: number, saturation: number): Promise<boolean> {
    return this.setLightState(hueId, {
      on: true,
      hue: Math.max(0, Math.min(65535, hue)),
      sat: Math.max(0, Math.min(254, saturation)),
    });
  }

  async setColorTemperature(hueId: string, ct: number): Promise<boolean> {
    return this.setLightState(hueId, {
      on: true,
      ct: Math.max(153, Math.min(500, ct)),
    });
  }

  // ─── GROUPS ─────────────────────────────────────────────────

  async getAllGroups(): Promise<HueGroup[]> {
    if (!this.baseUrl) return [];
    try {
      const response = await fetch(`${this.baseUrl}/groups`, {
        signal: AbortSignal.timeout(5000),
      });
      const data = await response.json();
      if (data && typeof data === 'object' && !Array.isArray(data)) {
        return Object.entries(data).map(([id, group]: [string, any]) => ({
          id,
          name: group.name,
          type: group.type,
          lights: group.lights,
          state: group.state,
          action: group.action,
        }));
      }
      return [];
    } catch (error) {
      this.logger.error(`Failed to get groups: ${error.message}`);
      return [];
    }
  }

  async setGroupAction(groupId: string, action: Partial<HueLightState>): Promise<boolean> {
    if (!this.baseUrl) return false;
    try {
      const response = await fetch(`${this.baseUrl}/groups/${groupId}/action`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(action),
        signal: AbortSignal.timeout(5000),
      });
      const data = await response.json();
      return Array.isArray(data) && data.some((r: any) => r.success);
    } catch (error) {
      this.logger.error(`Failed to set group ${groupId} action: ${error.message}`);
      return false;
    }
  }

  async toggleGroup(groupId: string): Promise<boolean> {
    const groups = await this.getAllGroups();
    const group = groups.find(g => g.id === groupId);
    if (!group) return false;
    return this.setGroupAction(groupId, { on: !group.state.any_on });
  }

  // ─── SCENES ─────────────────────────────────────────────────

  async getAllScenes(): Promise<HueScene[]> {
    if (!this.baseUrl) return [];
    try {
      const response = await fetch(`${this.baseUrl}/scenes`, {
        signal: AbortSignal.timeout(5000),
      });
      const data = await response.json();
      if (data && typeof data === 'object' && !Array.isArray(data)) {
        return Object.entries(data).map(([id, scene]: [string, any]) => ({
          id,
          name: scene.name,
          type: scene.type,
          group: scene.group,
          lights: scene.lights,
        }));
      }
      return [];
    } catch (error) {
      this.logger.error(`Failed to get scenes: ${error.message}`);
      return [];
    }
  }

  async activateScene(sceneId: string, groupId: string = '0'): Promise<boolean> {
    if (!this.baseUrl) return false;
    try {
      const response = await fetch(`${this.baseUrl}/groups/${groupId}/action`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scene: sceneId }),
        signal: AbortSignal.timeout(5000),
      });
      const data = await response.json();
      return Array.isArray(data) && data.some((r: any) => r.success);
    } catch (error) {
      this.logger.error(`Failed to activate scene ${sceneId}: ${error.message}`);
      return false;
    }
  }

  // ─── STATUS ─────────────────────────────────────────────────

  getConnectionStatus(): { connected: boolean; bridgeIp: string; hasApiKey: boolean } {
    return {
      connected: this.isConnected,
      bridgeIp: this.bridgeIp,
      hasApiKey: !!this.apiKey,
    };
  }
}
