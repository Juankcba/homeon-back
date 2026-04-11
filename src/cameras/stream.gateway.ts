import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Camera } from './entities/camera.entity';
import { ChildProcess, spawn } from 'child_process';
import * as WebSocket from 'ws';
import * as http from 'http';

/**
 * CameraStreamGateway — RTSP → MPEG1 → WebSocket proxy.
 *
 * Runs a raw `ws` WebSocket server on a dedicated port (default 3002).
 * Clients connect to: ws://host:3002/stream/{cameraId}
 *
 * For each camera, spawns ONE ffmpeg process that transcodes RTSP → MPEG-TS (mpeg1video).
 * Binary data is broadcast to all WebSocket clients watching that camera.
 * When the last client disconnects, ffmpeg is killed.
 *
 * Frontend renders the MPEG-TS stream via JSMpeg (canvas-based decoder).
 */
@Injectable()
export class CameraStreamGateway implements OnModuleDestroy {
  private readonly logger = new Logger(CameraStreamGateway.name);
  private wss: WebSocket.Server | null = null;
  private httpServer: http.Server | null = null;

  /** Active ffmpeg processes, keyed by cameraId */
  private streams = new Map<string, {
    process: ChildProcess;
    clients: Set<WebSocket>;
  }>();

  private port: number;

  constructor(
    @InjectRepository(Camera) private cameraRepository: Repository<Camera>,
    private configService: ConfigService,
  ) {
    this.port = parseInt(this.configService.get('STREAM_WS_PORT', '3002'), 10);
  }

  /**
   * Called from CamerasModule.onModuleInit() to start the WS server.
   */
  start() {
    this.httpServer = http.createServer();
    this.wss = new WebSocket.Server({ server: this.httpServer });

    this.wss.on('connection', (ws, req) => {
      const url = req.url || '';
      // Expected: /stream/{cameraId}
      const match = url.match(/^\/stream\/(.+?)(\?.*)?$/);
      if (!match) {
        this.logger.warn(`Invalid stream path: ${url}`);
        ws.close(4000, 'Invalid path. Use /stream/{cameraId}');
        return;
      }
      const cameraId = match[1];
      this.logger.log(`Stream client connected for camera ${cameraId}`);
      this.handleClient(ws, cameraId);
    });

    this.httpServer.listen(this.port, () => {
      this.logger.log(`📹 Stream WebSocket server listening on port ${this.port}`);
    });
  }

  onModuleDestroy() {
    // Kill all ffmpeg processes
    for (const [id, stream] of this.streams) {
      this.logger.log(`Stopping stream for camera ${id}`);
      stream.process.kill('SIGTERM');
      for (const ws of stream.clients) {
        ws.close();
      }
    }
    this.streams.clear();

    if (this.wss) this.wss.close();
    if (this.httpServer) this.httpServer.close();
  }

  private async handleClient(ws: WebSocket, cameraId: string) {
    // Look up camera
    let camera: Camera | null = null;
    try {
      camera = await this.cameraRepository.findOne({
        where: { id: cameraId, isActive: true },
      });
    } catch {
      ws.close(4004, 'Camera not found');
      return;
    }
    if (!camera) {
      ws.close(4004, 'Camera not found');
      return;
    }

    // Add client to existing stream or start new one
    const existing = this.streams.get(cameraId);
    if (existing) {
      existing.clients.add(ws);
      this.logger.debug(`Added client to existing stream for ${camera.name} (${existing.clients.size} clients)`);
    } else {
      this.startStream(camera, ws);
    }

    // Handle client disconnect
    ws.on('close', () => {
      this.logger.debug(`Stream client disconnected for ${camera.name}`);
      const entry = this.streams.get(cameraId);
      if (entry) {
        entry.clients.delete(ws);
        if (entry.clients.size === 0) {
          this.logger.log(`No more clients for ${camera.name}, stopping ffmpeg`);
          entry.process.kill('SIGTERM');
          this.streams.delete(cameraId);
        }
      }
    });

    ws.on('error', () => {
      ws.close();
    });
  }

  private startStream(camera: Camera, firstClient: WebSocket) {
    if (!camera.rtspUsername || !camera.rtspPassword) {
      this.logger.warn(`Cannot start stream for ${camera.name}: no RTSP credentials configured`);
      firstClient.close(1008, 'No RTSP credentials configured for this camera');
      return;
    }
    const user = encodeURIComponent(camera.rtspUsername);
    const pass = encodeURIComponent(camera.rtspPassword);
    const rtspUrl = `rtsp://${user}:${pass}@${camera.ip}:554/stream2`; // sub-stream for lower bandwidth

    this.logger.log(`Starting ffmpeg stream for ${camera.name} (${camera.ip})`);

    const ffmpeg = spawn('ffmpeg', [
      '-rtsp_transport', 'tcp',
      '-i', rtspUrl,
      '-f', 'mpegts',
      '-codec:v', 'mpeg1video',
      '-b:v', '800k',       // bitrate — tune for your network
      '-r', '24',            // framerate
      '-an',                 // no audio (lighter)
      '-s', '640x480',       // scale down for streaming
      '-bf', '0',            // no B-frames (lower latency)
      '-q:v', '8',           // quality
      '-',                   // output to stdout
    ], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const clients = new Set<WebSocket>([firstClient]);
    this.streams.set(camera.id, { process: ffmpeg, clients });

    ffmpeg.stdout.on('data', (data: Buffer) => {
      for (const client of clients) {
        if (client.readyState === WebSocket.OPEN) {
          client.send(data, { binary: true });
        }
      }
    });

    ffmpeg.stderr.on('data', (data: Buffer) => {
      const msg = data.toString();
      // Only log non-progress lines
      if (!msg.includes('frame=') && !msg.includes('size=')) {
        this.logger.debug(`ffmpeg [${camera.name}]: ${msg.trim().slice(0, 200)}`);
      }
    });

    ffmpeg.on('close', (code) => {
      this.logger.log(`ffmpeg exited for ${camera.name} (code ${code})`);
      const entry = this.streams.get(camera.id);
      if (entry) {
        // Notify clients that stream ended
        for (const client of entry.clients) {
          if (client.readyState === WebSocket.OPEN) {
            client.close(1000, 'Stream ended');
          }
        }
        this.streams.delete(camera.id);
      }
    });

    ffmpeg.on('error', (err) => {
      this.logger.error(`ffmpeg error for ${camera.name}: ${err.message}`);
      this.streams.delete(camera.id);
    });
  }
}
