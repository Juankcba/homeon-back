import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { IncomingMessage } from 'http';
import { URL } from 'url';
import { WebSocketServer, WebSocket } from 'ws';
import { EdgeService } from './edge.service';

interface PendingRequest {
  resolve: (value: any) => void;
  reject: (err: any) => void;
  timer: NodeJS.Timeout;
}

interface BridgeSession {
  deviceId: string;
  mac: string;
  ws: WebSocket;
  pending: Map<string, PendingRequest>;
}

/**
 * Raw WebSocket gateway for ESP32 edge devices.
 *
 *   URL: /bridge/ws   (port = backend HTTP port)
 *   Auth: Authorization: Bearer <deviceToken>   (set by firmware)
 *
 * The ESP connects outbound; the backend can then push commands like:
 *   { id, op: "http", method, url, headers, body }
 * and receive replies:
 *   { id, ok, status, body }
 *
 * This lets the cloud backend reach devices that live ONLY on the ESP's
 * LAN (Hue bridge on 192.168.1.x, Tapo cameras, gate controllers, etc.)
 * without exposing the LAN directly.
 */
@Injectable()
export class EdgeBridgeGateway implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('EdgeBridge');
  private wss?: WebSocketServer;
  private sessions = new Map<string, BridgeSession>();  // keyed by deviceId

  constructor(private readonly edge: EdgeService) {}

  onModuleInit() {
    // We piggy-back on the main HTTP server via noServer + upgrade handler.
    // main.ts wires `app.getHttpAdapter().getHttpServer()` into attachTo().
    this.wss = new WebSocketServer({ noServer: true });

    this.wss.on('connection', (ws, req, device) => {
      const d = device as { id: string; mac: string };
      const session: BridgeSession = { deviceId: d.id, mac: d.mac, ws, pending: new Map() };
      this.sessions.set(d.id, session);
      this.logger.log(`Device connected: ${d.mac} (${d.id})`);
      this.edge.updatePresence(d.id, { connected: true }).catch(() => {});

      ws.on('message', (raw) => this.handleMessage(session, raw.toString()));
      ws.on('close', () => {
        this.sessions.delete(d.id);
        this.edge.updatePresence(d.id, { connected: false }).catch(() => {});
        this.logger.log(`Device disconnected: ${d.mac}`);
      });
      ws.on('error', (err) => this.logger.warn(`WS error ${d.mac}: ${err.message}`));
    });
  }

  onModuleDestroy() {
    this.wss?.close();
  }

  /** Wire into the HTTP server's `upgrade` event. Called from main.ts. */
  attachTo(server: import('http').Server) {
    server.on('upgrade', async (req: IncomingMessage, socket, head) => {
      try {
        const url = new URL(req.url || '/', 'http://localhost');
        if (url.pathname !== '/bridge/ws') return; // let other gateways handle
        const auth = req.headers['authorization'] as string | undefined;
        if (!auth?.startsWith('Bearer ')) {
          socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
          socket.destroy();
          return;
        }
        const token = auth.slice(7);
        const device = await this.edge.authenticateByToken(token);
        this.wss!.handleUpgrade(req, socket, head, (ws) => {
          this.wss!.emit('connection', ws, req, device);
        });
      } catch (e: any) {
        this.logger.warn(`WS upgrade rejected: ${e.message}`);
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
      }
    });
    this.logger.log('Edge bridge attached to /bridge/ws');
  }

  // ─── Inbound messages ────────────────────────────────────────────────────
  private handleMessage(session: BridgeSession, raw: string) {
    let msg: any;
    try { msg = JSON.parse(raw); } catch { return; }

    // Device-initiated frames (hello / heartbeat)
    if (msg.op === 'hello' || msg.op === 'heartbeat') {
      this.edge
        .updatePresence(session.deviceId, {
          lastIp: msg.ip,
          lastRssi: msg.rssi,
          version: msg.version,
          connected: true,
        })
        .catch(() => {});
      return;
    }

    // Reply to a command we sent
    if (msg.id && session.pending.has(msg.id)) {
      const p = session.pending.get(msg.id)!;
      clearTimeout(p.timer);
      session.pending.delete(msg.id);
      if (msg.ok) p.resolve({ status: msg.status, body: msg.body });
      else        p.reject(new Error(msg.error || 'Remote error'));
    }
  }

  // ─── Public API (used by other modules to reach LAN via edge) ────────────

  /** Send an HTTP request through a specific edge device's LAN. */
  async proxyHttp(
    deviceId: string,
    req: {
      method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
      url: string;
      headers?: Record<string, string>;
      body?: string;
      timeoutMs?: number;
    },
  ): Promise<{ status: number; body: string }> {
    const session = this.sessions.get(deviceId);
    if (!session) throw new Error(`Edge device ${deviceId} not connected`);
    const id = randomUUID();
    const msg = { id, op: 'http', ...req };
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        session.pending.delete(id);
        reject(new Error('Edge bridge timeout'));
      }, req.timeoutMs ?? 10_000);
      session.pending.set(id, { resolve, reject, timer });
      session.ws.send(JSON.stringify(msg));
    });
  }

  /** List currently online devices. */
  onlineDevices(): string[] {
    return Array.from(this.sessions.keys());
  }

  isOnline(deviceId: string) {
    return this.sessions.has(deviceId);
  }
}
