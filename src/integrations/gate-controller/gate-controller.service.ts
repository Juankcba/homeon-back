import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as net from 'net';
import { DeviceConfig } from '../../devices/entities/device-config.entity';

/**
 * GateControllerService — MQTT integration with ESP32 (Heltec) via Raspberry Pi broker.
 *
 * Architecture:
 *   Raspberry Pi runs Mosquitto MQTT broker (TCP 1883, WebSocket 8081).
 *   ESP32 (Heltec) subscribes to topics and controls relays.
 *   This service publishes MQTT messages using raw TCP (no external library).
 *
 * Protocol:
 *   publish "on" to topic → wait pulseDuration ms → publish "off"
 *   This triggers a momentary relay pulse that activates the gate motor.
 *
 * Topics:
 *   heltec/relay1 — Gate motor
 *   heltec/relay2 — Spare relay
 */

export type GateState = 'open' | 'closed' | 'opening' | 'closing' | 'stopped' | 'unknown';

export interface GateControllerHealth {
  reachable: boolean;
  responseTimeMs: number;
  lastSeen: Date;
  brokerIp?: string;
  mqttPort?: number;
}

@Injectable()
export class GateControllerService implements OnModuleInit {
  private readonly logger = new Logger(GateControllerService.name);

  // MQTT broker config (loaded from DB)
  private brokerIp = '192.168.68.51';
  private mqttPort = 1883;
  private gateTopic = 'heltec/relay1';
  private spareTopic = 'heltec/relay2';
  private pulseDuration = 3000; // ms — on → wait → off

  private lastHealthCheck: GateControllerHealth | null = null;

  constructor(
    @InjectRepository(DeviceConfig)
    private configRepo: Repository<DeviceConfig>,
    private configService: ConfigService,
  ) {}

  async onModuleInit() {
    await this.loadConfig();
    this.logger.log(
      `GateControllerService ready — broker ${this.brokerIp}:${this.mqttPort}, ` +
      `topic "${this.gateTopic}", pulse ${this.pulseDuration}ms`,
    );
    await this.checkHealth();
  }

  // ═══════════════════════════════════════════════════════════
  //  Config persistence (DeviceConfig table)
  // ═══════════════════════════════════════════════════════════

  private async loadConfig() {
    let cfg = await this.configRepo.findOne({ where: { type: 'gate-controller' } });
    if (!cfg) {
      // Seed from env / defaults
      cfg = this.configRepo.create({
        type: 'gate-controller',
        label: 'Portón MQTT (Heltec/RPi)',
        ip: this.configService.get('GATE_BROKER_IP', '192.168.68.51'),
        apiKey: '', // not needed for MQTT
        meta: {
          mqttPort: 1883,
          wsPort: 8081,
          gateTopic: 'heltec/relay1',
          spareTopic: 'heltec/relay2',
          pulseDuration: 3000,
        },
        connected: false,
      });
      await this.configRepo.save(cfg);
      this.logger.log('Gate controller config seeded from defaults');
    }

    this.brokerIp = cfg.ip;
    this.mqttPort = cfg.meta?.mqttPort ?? 1883;
    this.gateTopic = cfg.meta?.gateTopic ?? 'heltec/relay1';
    this.spareTopic = cfg.meta?.spareTopic ?? 'heltec/relay2';
    this.pulseDuration = cfg.meta?.pulseDuration ?? 3000;
  }

  private async saveConfig() {
    const cfg = await this.configRepo.findOne({ where: { type: 'gate-controller' } });
    if (!cfg) return;
    cfg.ip = this.brokerIp;
    cfg.meta = {
      ...cfg.meta,
      mqttPort: this.mqttPort,
      gateTopic: this.gateTopic,
      spareTopic: this.spareTopic,
      pulseDuration: this.pulseDuration,
    };
    await this.configRepo.save(cfg);
  }

  // ═══════════════════════════════════════════════════════════
  //  Setup endpoints (called from controller)
  // ═══════════════════════════════════════════════════════════

  getConnectionInfo() {
    return {
      brokerIp: this.brokerIp,
      mqttPort: this.mqttPort,
      wsPort: (this.lastHealthCheck as any)?.wsPort ?? 8081,
      gateTopic: this.gateTopic,
      spareTopic: this.spareTopic,
      pulseDuration: this.pulseDuration,
      connected: this.lastHealthCheck?.reachable ?? false,
      lastSeen: this.lastHealthCheck?.lastSeen ?? null,
    };
  }

  async setBroker(ip: string, mqttPort?: number): Promise<{ ip: string; reachable: boolean }> {
    this.brokerIp = ip;
    if (mqttPort) this.mqttPort = mqttPort;
    await this.saveConfig();
    const health = await this.checkHealth();
    return { ip: this.brokerIp, reachable: health.reachable };
  }

  async setTopics(gateTopic?: string, spareTopic?: string, pulseDuration?: number) {
    if (gateTopic) this.gateTopic = gateTopic;
    if (spareTopic) this.spareTopic = spareTopic;
    if (pulseDuration) this.pulseDuration = pulseDuration;
    await this.saveConfig();
    return { gateTopic: this.gateTopic, spareTopic: this.spareTopic, pulseDuration: this.pulseDuration };
  }

  // ═══════════════════════════════════════════════════════════
  //  Raw MQTT 3.1.1 over TCP
  // ═══════════════════════════════════════════════════════════

  /**
   * Build a minimal MQTT CONNECT packet (protocol 3.1.1)
   */
  private buildConnectPacket(clientId: string): Buffer {
    const protocolName = Buffer.from([0x00, 0x04, 0x4D, 0x51, 0x54, 0x54]); // "MQTT"
    const protocolLevel = Buffer.from([0x04]); // 3.1.1
    const connectFlags = Buffer.from([0x02]); // Clean session
    const keepAlive = Buffer.from([0x00, 0x3C]); // 60s

    const clientIdBuf = Buffer.from(clientId, 'utf8');
    const clientIdLen = Buffer.alloc(2);
    clientIdLen.writeUInt16BE(clientIdBuf.length);

    const payload = Buffer.concat([protocolName, protocolLevel, connectFlags, keepAlive, clientIdLen, clientIdBuf]);

    // Fixed header: type=CONNECT (0x10), remaining length
    const remainingLength = this.encodeRemainingLength(payload.length);
    return Buffer.concat([Buffer.from([0x10]), remainingLength, payload]);
  }

  /**
   * Build an MQTT PUBLISH packet
   */
  private buildPublishPacket(topic: string, message: string): Buffer {
    const topicBuf = Buffer.from(topic, 'utf8');
    const topicLen = Buffer.alloc(2);
    topicLen.writeUInt16BE(topicBuf.length);

    const msgBuf = Buffer.from(message, 'utf8');
    const variableHeader = Buffer.concat([topicLen, topicBuf]);
    const payload = Buffer.concat([variableHeader, msgBuf]);

    // Fixed header: type=PUBLISH (0x30), QoS 0, no retain
    const remainingLength = this.encodeRemainingLength(payload.length);
    return Buffer.concat([Buffer.from([0x30]), remainingLength, payload]);
  }

  /**
   * Build an MQTT DISCONNECT packet
   */
  private buildDisconnectPacket(): Buffer {
    return Buffer.from([0xE0, 0x00]);
  }

  /**
   * Encode MQTT remaining length (variable-length encoding)
   */
  private encodeRemainingLength(length: number): Buffer {
    const bytes: number[] = [];
    let x = length;
    do {
      let encodedByte = x % 128;
      x = Math.floor(x / 128);
      if (x > 0) encodedByte |= 0x80;
      bytes.push(encodedByte);
    } while (x > 0);
    return Buffer.from(bytes);
  }

  /**
   * Open a TCP connection to the MQTT broker, send CONNECT + PUBLISH, then DISCONNECT.
   */
  private mqttPublish(topic: string, message: string): Promise<boolean> {
    return new Promise((resolve) => {
      const clientId = `homeon-gate-${Date.now()}`;
      const socket = new net.Socket();
      let resolved = false;

      const done = (ok: boolean) => {
        if (resolved) return;
        resolved = true;
        try { socket.destroy(); } catch {}
        resolve(ok);
      };

      socket.setTimeout(5000);
      socket.on('timeout', () => {
        this.logger.warn('MQTT TCP timeout');
        done(false);
      });
      socket.on('error', (err) => {
        this.logger.warn(`MQTT TCP error: ${err.message}`);
        done(false);
      });

      socket.connect(this.mqttPort, this.brokerIp, () => {
        // 1) Send CONNECT
        socket.write(this.buildConnectPacket(clientId));
      });

      let connAckReceived = false;

      socket.on('data', (data) => {
        // Wait for CONNACK (0x20, 0x02, 0x00, 0x00)
        if (!connAckReceived && data[0] === 0x20) {
          connAckReceived = true;
          const returnCode = data[3];
          if (returnCode !== 0) {
            this.logger.error(`MQTT CONNACK refused: code=${returnCode}`);
            done(false);
            return;
          }

          // 2) Send PUBLISH
          socket.write(this.buildPublishPacket(topic, message));

          // 3) QoS 0 → no ACK needed, send DISCONNECT after a small delay
          setTimeout(() => {
            socket.write(this.buildDisconnectPacket());
            done(true);
          }, 100);
        }
      });
    });
  }

  // ═══════════════════════════════════════════════════════════
  //  Gate commands
  // ═══════════════════════════════════════════════════════════

  /**
   * Trigger a relay pulse: publish "on" → wait pulseDuration → publish "off"
   * This is how the ESP32/Heltec gate controller works.
   */
  async triggerRelay(channel: 'gate' | 'spare' = 'gate'): Promise<boolean> {
    const topic = channel === 'gate' ? this.gateTopic : this.spareTopic;

    this.logger.log(`Triggering relay pulse on "${topic}"...`);

    // Step 1: publish "on"
    const onSent = await this.mqttPublish(topic, 'on');
    if (!onSent) {
      this.logger.error(`Failed to send "on" to "${topic}"`);
      return false;
    }

    // Step 2: wait pulseDuration
    await new Promise((r) => setTimeout(r, this.pulseDuration));

    // Step 3: publish "off"
    const offSent = await this.mqttPublish(topic, 'off');
    if (!offSent) {
      this.logger.warn(`"off" failed for "${topic}" — relay may stay on!`);
      // Try once more
      await new Promise((r) => setTimeout(r, 500));
      await this.mqttPublish(topic, 'off');
    }

    this.logger.log(`Relay pulse on "${topic}" complete`);
    return true;
  }

  /**
   * Open the gate (trigger relay pulse)
   * The gate motor is a single-button toggle — each pulse toggles open/close.
   */
  async open(): Promise<boolean> {
    return this.triggerRelay('gate');
  }

  /**
   * Close the gate (same pulse — it's a toggle motor)
   */
  async close(): Promise<boolean> {
    return this.triggerRelay('gate');
  }

  /**
   * Emergency stop — send "off" immediately (cut relay)
   */
  async stop(): Promise<boolean> {
    const topic = this.gateTopic;
    this.logger.warn(`EMERGENCY STOP — sending "off" to "${topic}"`);
    return this.mqttPublish(topic, 'off');
  }

  // ═══════════════════════════════════════════════════════════
  //  Health check
  // ═══════════════════════════════════════════════════════════

  /**
   * Check if the MQTT broker is reachable via TCP connect test
   */
  async checkHealth(): Promise<GateControllerHealth> {
    const startTime = Date.now();

    const reachable = await new Promise<boolean>((resolve) => {
      const socket = new net.Socket();
      socket.setTimeout(3000);
      socket.on('connect', () => {
        socket.destroy();
        resolve(true);
      });
      socket.on('timeout', () => {
        socket.destroy();
        resolve(false);
      });
      socket.on('error', () => {
        socket.destroy();
        resolve(false);
      });
      socket.connect(this.mqttPort, this.brokerIp);
    });

    const responseTime = Date.now() - startTime;

    this.lastHealthCheck = {
      reachable,
      responseTimeMs: responseTime,
      lastSeen: reachable ? new Date() : (this.lastHealthCheck?.lastSeen ?? new Date()),
      brokerIp: this.brokerIp,
      mqttPort: this.mqttPort,
    };

    // Update connected flag in DB
    const cfg = await this.configRepo.findOne({ where: { type: 'gate-controller' } });
    if (cfg) {
      cfg.connected = reachable;
      await this.configRepo.save(cfg);
    }

    if (reachable) {
      this.logger.debug(`MQTT broker reachable at ${this.brokerIp}:${this.mqttPort} (${responseTime}ms)`);
    } else {
      this.logger.warn(`MQTT broker unreachable at ${this.brokerIp}:${this.mqttPort}`);
    }

    return this.lastHealthCheck;
  }

  /**
   * Get the current hardware status.
   * Since the gate uses a simple relay toggle, we can't read state from hardware.
   * We return the last known state from the DB.
   */
  async getStatus() {
    const health = await this.checkHealth();
    return {
      state: 'unknown' as GateState,
      position: 0,
      obstacle: false,
      locked: false,
      controllerReachable: health.reachable,
      brokerIp: this.brokerIp,
      mqttPort: this.mqttPort,
    };
  }

  getLastHealthCheck(): GateControllerHealth | null {
    return this.lastHealthCheck;
  }

  isReachable(): boolean {
    return this.lastHealthCheck?.reachable ?? false;
  }
}
