import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Light } from './entities/light.entity';
import { LightGroup } from './entities/light-group.entity';
import { LightScene } from './entities/light-scene.entity';
import { HueService, HueLight, HueGroup, HueScene as HueSceneType } from '../integrations/hue/hue.service';

@Injectable()
export class LightsService {
  private readonly logger = new Logger(LightsService.name);

  constructor(
    @InjectRepository(Light)
    private lightsRepository: Repository<Light>,
    @InjectRepository(LightGroup)
    private groupsRepository: Repository<LightGroup>,
    @InjectRepository(LightScene)
    private scenesRepository: Repository<LightScene>,
    private hueService: HueService,
  ) {}

  // ═══════════════════════════════════════════════════════════
  //  Hue Bridge setup endpoints
  // ═══════════════════════════════════════════════════════════

  /** Get current bridge connection status */
  getHueStatus() {
    return this.hueService.getConnectionStatus();
  }

  /** Discover the bridge on the network */
  async discoverBridge() {
    return this.hueService.discoverBridge();
  }

  /** Set bridge IP manually */
  async setBridgeIp(ip: string) {
    const reachable = await this.hueService.setBridgeIp(ip);
    return { ip, reachable };
  }

  /** Pair with bridge (user must press link button first) */
  async pairBridge() {
    return this.hueService.pair();
  }

  /** Test connection to the bridge */
  async testBridge() {
    const connected = await this.hueService.testConnection();
    const status = this.hueService.getConnectionStatus();
    const config = connected ? await this.hueService.getBridgeConfig() : null;
    return { ...status, connected, bridgeInfo: config };
  }

  /**
   * Purge ALL lights, groups and scenes from the DB, then re-sync from the bridge.
   * Use this to wipe old seed / fake data.
   */
  async purgeAndSync(): Promise<{ purged: { lights: number; groups: number; scenes: number }; synced: { lights: number; groups: number; scenes: number } }> {
    const lCount = await this.lightsRepository.count();
    const gCount = await this.groupsRepository.count();
    const sCount = await this.scenesRepository.count();

    await this.scenesRepository.clear();
    await this.groupsRepository.clear();
    await this.lightsRepository.clear();

    this.logger.log(`Purged: ${lCount} lights, ${gCount} groups, ${sCount} scenes`);

    const synced = await this.syncFromBridge();
    return {
      purged: { lights: lCount, groups: gCount, scenes: sCount },
      synced,
    };
  }

  /**
   * Sync lights, groups, and scenes from the real Hue Bridge into the DB.
   * This is the main "import" operation.
   */
  async syncFromBridge(): Promise<{ lights: number; groups: number; scenes: number }> {
    const status = this.hueService.getConnectionStatus();
    if (!status.hasApiKey) {
      throw new NotFoundException('Hue Bridge not paired. Call /lights/hue/pair first.');
    }

    // ─── Sync lights ──────────────────────────────────────
    const hueLights = await this.hueService.getAllLights();
    let lightCount = 0;
    for (const hl of hueLights) {
      let light = await this.lightsRepository.findOne({ where: { hueId: hl.id } });
      if (!light) {
        light = this.lightsRepository.create({ hueId: hl.id });
      }
      light.name = hl.name;
      light.on = hl.state?.on ?? false;
      light.brightness = hl.state?.bri ?? 0;
      light.reachable = hl.state?.reachable ?? false;
      if (hl.state?.ct) light.colorTemp = hl.state.ct;
      if (hl.state?.hue !== undefined && hl.state?.sat !== undefined) {
        light.color = { hue: hl.state.hue, saturation: hl.state.sat, xy: hl.state.xy || [0, 0] };
      }
      light.type = hl.type;
      // Room/floor gets assigned later when processing groups.
      // Set a default so the row can be saved.
      if (!light.room) light.room = 'Sin asignar';
      await this.lightsRepository.save(light);
      lightCount++;
    }

    // ─── Sync groups ──────────────────────────────────────
    const hueGroups = await this.hueService.getAllGroups();
    let groupCount = 0;
    for (const hg of hueGroups) {
      // Skip non-Room groups (e.g., Entertainment, Zone, etc.) or include all
      let group = await this.groupsRepository.findOne({ where: { hueGroupId: hg.id } });
      if (!group) {
        group = this.groupsRepository.create({ hueGroupId: hg.id });
      }
      group.name = hg.name;
      group.on = hg.state?.any_on ?? false;
      group.brightness = hg.action?.bri ?? 0;
      group.room = hg.name; // Use group name as room
      group.floor = guessFloor(hg.name);

      // Map hue light IDs → our DB light IDs
      const dbLightIds: string[] = [];
      for (const hueLightId of hg.lights) {
        const dbLight = await this.lightsRepository.findOne({ where: { hueId: hueLightId } });
        if (dbLight) {
          // Also set the room/floor on the light from the group
          dbLight.room = hg.name;
          dbLight.floor = group.floor;
          await this.lightsRepository.save(dbLight);
          dbLightIds.push(dbLight.id);
        }
      }
      group.lightIds = dbLightIds;
      await this.groupsRepository.save(group);
      groupCount++;
    }

    // ─── Sync scenes ──────────────────────────────────────
    const hueScenes = await this.hueService.getAllScenes();
    let sceneCount = 0;
    for (const hs of hueScenes) {
      let scene = await this.scenesRepository.findOne({ where: { hueSceneId: hs.id } });
      if (!scene) {
        scene = this.scenesRepository.create({ hueSceneId: hs.id });
      }
      scene.name = hs.name;
      scene.description = `${hs.type} — ${hs.lights?.length || 0} luces`;
      await this.scenesRepository.save(scene);
      sceneCount++;
    }

    this.logger.log(`Sync complete: ${lightCount} lights, ${groupCount} groups, ${sceneCount} scenes`);
    return { lights: lightCount, groups: groupCount, scenes: sceneCount };
  }

  // ═══════════════════════════════════════════════════════════
  //  CRUD — Lights
  // ═══════════════════════════════════════════════════════════

  async findAll(): Promise<Light[]> {
    return this.lightsRepository.find({ order: { room: 'ASC', sortOrder: 'ASC' } });
  }

  async findOne(id: string): Promise<Light> {
    const light = await this.lightsRepository.findOne({ where: { id } });
    if (!light) throw new NotFoundException(`Light ${id} not found`);
    return light;
  }

  async toggle(id: string): Promise<Light> {
    const light = await this.findOne(id);
    light.on = !light.on;
    if (light.on && light.brightness === 0) light.brightness = 200;

    const sent = await this.hueService.setLightState(light.hueId, { on: light.on });
    if (!sent) {
      this.logger.warn(`Hue toggle failed for "${light.name}" (hueId=${light.hueId})`);
    }
    return this.lightsRepository.save(light);
  }

  async setBrightness(id: string, brightness: number): Promise<Light> {
    const light = await this.findOne(id);
    light.brightness = Math.max(0, Math.min(254, brightness));

    const sent = await this.hueService.setBrightness(light.hueId, light.brightness);
    if (!sent) this.logger.warn(`Hue brightness failed for "${light.name}"`);
    return this.lightsRepository.save(light);
  }

  async setColor(id: string, hue: number, saturation: number): Promise<Light> {
    const light = await this.findOne(id);
    light.color = { hue, saturation, xy: [0.33, 0.32] };

    const sent = await this.hueService.setColor(light.hueId, hue, saturation);
    if (!sent) this.logger.warn(`Hue color failed for "${light.name}"`);
    return this.lightsRepository.save(light);
  }

  async setColorTemp(id: string, colorTemp: number): Promise<Light> {
    const light = await this.findOne(id);
    light.colorTemp = Math.max(150, Math.min(500, colorTemp));

    const sent = await this.hueService.setColorTemperature(light.hueId, light.colorTemp);
    if (!sent) this.logger.warn(`Hue colorTemp failed for "${light.name}"`);
    return this.lightsRepository.save(light);
  }

  // ═══════════════════════════════════════════════════════════
  //  CRUD — Groups
  // ═══════════════════════════════════════════════════════════

  async getAllGroups(): Promise<LightGroup[]> {
    return this.groupsRepository.find({ order: { sortOrder: 'ASC', name: 'ASC' } });
  }

  async findGroupOne(groupId: string): Promise<LightGroup> {
    const group = await this.groupsRepository.findOne({ where: { id: groupId } });
    if (!group) throw new NotFoundException(`Light group ${groupId} not found`);
    return group;
  }

  async toggleGroup(groupId: string): Promise<LightGroup> {
    const group = await this.findGroupOne(groupId);
    group.on = !group.on;

    // Use Hue group action if we have the hueGroupId (much faster than per-light)
    if (group.hueGroupId) {
      const sent = await this.hueService.setGroupAction(group.hueGroupId, { on: group.on });
      if (!sent) this.logger.warn(`Hue group toggle failed for "${group.name}"`);
    }

    // Update individual light states in DB
    for (const lightId of group.lightIds) {
      const light = await this.lightsRepository.findOne({ where: { id: lightId } });
      if (light) {
        light.on = group.on;
        if (light.on && light.brightness === 0) light.brightness = 200;
        await this.lightsRepository.save(light);
      }
    }

    return this.groupsRepository.save(group);
  }

  // ═══════════════════════════════════════════════════════════
  //  CRUD — Scenes
  // ═══════════════════════════════════════════════════════════

  async getScenes(): Promise<LightScene[]> {
    return this.scenesRepository.find({ order: { sortOrder: 'ASC' } });
  }

  async getScene(sceneId: string): Promise<LightScene> {
    const scene = await this.scenesRepository.findOne({ where: { id: sceneId } });
    if (!scene) throw new NotFoundException(`Scene ${sceneId} not found`);
    return scene;
  }

  async activateScene(sceneId: string): Promise<boolean> {
    await this.scenesRepository.update({}, { isActive: false });
    await this.scenesRepository.update(sceneId, { isActive: true });

    const scene = await this.getScene(sceneId);
    if (scene.hueSceneId) {
      const activated = await this.hueService.activateScene(scene.hueSceneId);
      if (!activated) this.logger.warn(`Hue scene activation failed for "${scene.name}"`);
    }
    return true;
  }

  // ═══════════════════════════════════════════════════════════
  //  Stats
  // ═══════════════════════════════════════════════════════════

  async getStats() {
    const lights = await this.lightsRepository.find();
    const groups = await this.groupsRepository.find();
    const activeScene = await this.scenesRepository.findOne({ where: { isActive: true } });
    const hueStatus = this.hueService.getConnectionStatus();
    return {
      totalLights: lights.length,
      onLights: lights.filter(l => l.on).length,
      totalGroups: groups.length,
      activeScene: activeScene?.name || null,
      bridgeConnected: hueStatus.connected,
      bridgeIp: hueStatus.bridgeIp,
    };
  }
}

/** Guess floor from group/room name */
function guessFloor(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes('exterior') || lower.includes('patio') || lower.includes('garage') || lower.includes('jardín') || lower.includes('jardin') || lower.includes('terraza')) return 'Ext';
  if (lower.includes('piso 1') || lower.includes('1p') || lower.includes('dormitorio') || lower.includes('habitación') || lower.includes('habitacion')) return '1P';
  return 'PB';
}
