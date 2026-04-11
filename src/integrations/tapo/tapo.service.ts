import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import * as https from 'https';
import * as http from 'http';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const execFileAsync = promisify(execFile);

/**
 * TapoService - Real integration with TP-Link Tapo cameras (C200, C310, C320WS, etc.)
 *
 * IMPORTANT AUTH NOTES:
 * - Local HTTP API uses username "admin" (NOT the TP-Link cloud email)
 * - Password is MD5-hashed (uppercase hex)
 * - Some newer firmware uses plaintext password as fallback
 * - RTSP streams use the camera account credentials set in the Tapo app
 * - C200 uses HTTP on port 80, C320WS uses HTTPS on port 443
 */

export interface TapoCameraInfo {
  device_model: string;
  device_name: string;
  firmware_ver: string;
  mac: string;
  hw_version: string;
  ip: string;
  is_up: boolean;
}

export interface TapoStreamUrls {
  rtspMain: string;
  rtspSub: string;
  onvif: string;
}

interface TapoSession {
  stok: string;
  ip: string;
  protocol: 'http' | 'https';
  expiresAt: number;
}

// Custom HTTPS agent that accepts self-signed certs
const insecureHttpsAgent = new https.Agent({ rejectUnauthorized: false });

/**
 * Make HTTP or HTTPS request to Tapo cameras.
 * Handles self-signed certs and timeouts.
 */
function tapoFetch(
  url: string,
  options: { method?: string; headers?: Record<string, string>; body?: string; timeout?: number },
): Promise<{ ok: boolean; status: number; json: () => Promise<any>; buffer: () => Promise<Buffer> }> {
  const timeoutMs = options.timeout || 5000;
  const isHttps = url.startsWith('https://');
  const parsedUrl = new URL(url);
  const mod = isHttps ? https : http;

  return new Promise((resolve, reject) => {
    const reqOptions: any = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (isHttps ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method: options.method || 'GET',
      headers: options.headers || {},
      timeout: timeoutMs,
    };

    if (isHttps) {
      reqOptions.rejectUnauthorized = false;
      reqOptions.agent = insecureHttpsAgent;
    }

    const req = mod.request(reqOptions, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => {
        const body = Buffer.concat(chunks);
        const statusCode = res.statusCode || 0;
        resolve({
          ok: statusCode >= 200 && statusCode < 300,
          status: statusCode,
          json: () => {
            try {
              return Promise.resolve(JSON.parse(body.toString()));
            } catch {
              return Promise.reject(new Error(`Invalid JSON from ${url}: ${body.toString().slice(0, 200)}`));
            }
          },
          buffer: () => Promise.resolve(body),
        });
      });
    });

    req.on('error', (err: Error) => reject(err));
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Timeout after ${timeoutMs}ms connecting to ${url}`));
    });

    if (options.body) {
      req.write(options.body);
    }
    req.end();
  });
}

@Injectable()
export class TapoService implements OnModuleInit {
  private readonly logger = new Logger(TapoService.name);
  private sessions = new Map<string, TapoSession>();

  /** TP-Link cloud email (for local HTTP API auth) */
  private cloudUsername: string;
  /** TP-Link cloud password */
  private cloudPassword: string;
  /** ffmpeg available? */
  private ffmpegAvailable = false;

  constructor(private configService: ConfigService) {
    this.cloudUsername = this.configService.get('TAPO_USERNAME', 'admin');
    this.cloudPassword = this.configService.get('TAPO_PASSWORD', '');
    // RTSP credentials are now per-camera — configured when adding each camera
  }

  async onModuleInit() {
    this.logger.log('TapoService initialized');
    this.logger.log(`  Cloud username: ${this.cloudUsername}`);
    this.logger.log(`  RTSP credentials: per-camera (no global fallback)`);
    this.logger.log(`  Password configured: ${this.cloudPassword ? 'YES' : 'NO'}`);

    // Check if ffmpeg is available
    try {
      await execFileAsync('ffmpeg', ['-version']);
      this.ffmpegAvailable = true;
      this.logger.log('  ffmpeg: AVAILABLE ✅');
    } catch {
      this.ffmpegAvailable = false;
      this.logger.warn('  ffmpeg: NOT FOUND — install ffmpeg for RTSP snapshots');
    }
  }

  // ─── Protocol detection ────────────────────────────────────────

  private async detectProtocol(ip: string): Promise<'http' | 'https'> {
    // Try HTTPS first (C320WS, C520WS)
    try {
      await tapoFetch(`https://${ip}/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method: 'getDeviceInfo' }),
        timeout: 2000,
      });
      this.logger.debug(`${ip} → HTTPS`);
      return 'https';
    } catch { /* not HTTPS */ }

    // Try HTTP (C200, C310)
    try {
      await tapoFetch(`http://${ip}/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method: 'getDeviceInfo' }),
        timeout: 2000,
      });
      this.logger.debug(`${ip} → HTTP`);
      return 'http';
    } catch { /* not HTTP either */ }

    return 'http'; // default for older models
  }

  private async getBaseUrl(ip: string): Promise<string> {
    const cached = this.sessions.get(ip);
    if (cached) return `${cached.protocol}://${ip}`;
    const protocol = await this.detectProtocol(ip);
    return `${protocol}://${ip}`;
  }

  // ─── Authentication ────────────────────────────────────────────

  /**
   * Authenticate with a Tapo camera.
   *
   * Tries multiple strategies:
   * 1. "admin" + MD5 hashed password (most common for local API)
   * 2. "admin" + plaintext password (some newer firmware)
   * 3. Cloud email + MD5 hashed password (fallback)
   * 4. Cloud email + plaintext password (last resort)
   */
  async authenticate(ip: string): Promise<string> {
    const cached = this.sessions.get(ip);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.stok;
    }

    const baseUrl = await this.getBaseUrl(ip);
    const protocol = baseUrl.startsWith('https') ? 'https' as const : 'http' as const;
    const hashedPassword = this.hashTapoPassword(this.cloudPassword);

    // Strategy 1: admin + hashed password (most C200/C310)
    const strategies = [
      { username: 'admin', password: hashedPassword, hashed: true, label: 'admin+hash' },
      { username: 'admin', password: this.cloudPassword, hashed: false, label: 'admin+plain' },
      { username: this.cloudUsername, password: hashedPassword, hashed: true, label: 'email+hash' },
      { username: this.cloudUsername, password: this.cloudPassword, hashed: false, label: 'email+plain' },
    ];

    for (const strategy of strategies) {
      try {
        const body: any = {
          method: 'login',
          params: {
            username: strategy.username,
            password: strategy.password,
          },
        };
        if (strategy.hashed) {
          body.params.hashed = true;
        }

        const response = await tapoFetch(`${baseUrl}/`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          timeout: 5000,
        });

        const data = await response.json();
        const stok = data.result?.stok || data.stok;

        if (stok) {
          this.sessions.set(ip, { stok, ip, protocol, expiresAt: Date.now() + 10 * 60 * 1000 });
          this.logger.log(`Auth OK for ${ip} using strategy: ${strategy.label}`);
          return stok;
        }

        // error_code -40401 = invalid credentials, try next
        if (data.error_code === -40401) {
          this.logger.debug(`Auth ${strategy.label} rejected for ${ip}, trying next...`);
          continue;
        }

        // Other error, still try next strategy
        this.logger.debug(`Auth ${strategy.label} error ${data.error_code} for ${ip}`);
      } catch (error) {
        this.logger.debug(`Auth ${strategy.label} exception for ${ip}: ${error.message}`);
      }
    }

    throw new Error(`All authentication strategies failed for ${ip}`);
  }

  // ─── Commands ──────────────────────────────────────────────────

  async executeCommand(ip: string, method: string, params?: any): Promise<any> {
    const stok = await this.authenticate(ip);
    const cached = this.sessions.get(ip);
    const baseUrl = cached ? `${cached.protocol}://${ip}` : await this.getBaseUrl(ip);

    try {
      const response = await tapoFetch(`${baseUrl}/stok=${stok}/ds`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method, params }),
        timeout: 10000,
      });

      const data = await response.json();

      if (data.error_code === -40401 || data.error_code === -40210) {
        // Session expired, retry once
        this.logger.debug(`Stok expired for ${ip}, re-authenticating...`);
        this.sessions.delete(ip);
        const newStok = await this.authenticate(ip);
        const newCached = this.sessions.get(ip);
        const newBase = newCached ? `${newCached.protocol}://${ip}` : baseUrl;

        const retry = await tapoFetch(`${newBase}/stok=${newStok}/ds`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ method, params }),
          timeout: 10000,
        });
        return retry.json();
      }

      return data;
    } catch (error) {
      this.logger.error(`Command ${method} failed on ${ip}: ${error.message}`);
      throw error;
    }
  }

  // ─── Device info ───────────────────────────────────────────────

  async getDeviceInfo(ip: string): Promise<TapoCameraInfo> {
    try {
      const data = await this.executeCommand(ip, 'getDeviceInfo');
      this.logger.debug(`getDeviceInfo raw for ${ip}: ${JSON.stringify(data).slice(0, 500)}`);

      // The response structure can vary by firmware
      const info = data.result?.device_info?.basic_info
        || data.device_info?.basic_info
        || data.result
        || {};

      return {
        device_model: info.device_model || info.model || 'Unknown',
        device_name: info.device_alias || info.alias || info.device_name || 'Tapo Camera',
        firmware_ver: info.sw_version || info.fw_ver || 'Unknown',
        mac: info.mac || info.hw_id || '',
        hw_version: info.hw_version || info.hw_ver || '',
        ip,
        is_up: true,
      };
    } catch (error) {
      this.logger.warn(`getDeviceInfo failed for ${ip}: ${error.message}`);
      return {
        device_model: 'Unknown',
        device_name: 'Tapo Camera',
        firmware_ver: 'Unknown',
        mac: '',
        hw_version: '',
        ip,
        is_up: false,
      };
    }
  }

  // ─── Ping ──────────────────────────────────────────────────────

  async ping(ip: string): Promise<boolean> {
    for (const proto of ['https', 'http'] as const) {
      try {
        await tapoFetch(`${proto}://${ip}/`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ method: 'getDeviceInfo' }),
          timeout: 3000,
        });
        return true; // Any response = reachable
      } catch { /* try next */ }
    }
    return false;
  }

  // ─── Stream URLs ───────────────────────────────────────────────

  getStreamUrls(ip: string, cameraRtspUser?: string, cameraRtspPass?: string): TapoStreamUrls {
    if (!cameraRtspUser || !cameraRtspPass) {
      this.logger.warn(`No RTSP credentials for ${ip} — RTSP streams will not work`);
      return {
        rtspMain: `rtsp://${ip}:554/stream1`,   // will fail auth but keeps the URL structure
        rtspSub: `rtsp://${ip}:554/stream2`,
        onvif: `http://${ip}:2020/onvif/device_service`,
      };
    }
    const user = encodeURIComponent(cameraRtspUser);
    const pass = encodeURIComponent(cameraRtspPass);
    return {
      rtspMain: `rtsp://${user}:${pass}@${ip}:554/stream1`,
      rtspSub: `rtsp://${user}:${pass}@${ip}:554/stream2`,
      onvif: `http://${ip}:2020/onvif/device_service`,
    };
  }

  /** Check if RTSP credentials are provided */
  hasRtspCredentials(cameraRtspUser?: string, cameraRtspPass?: string): boolean {
    return !!(cameraRtspUser && cameraRtspPass);
  }

  // ─── Snapshots ─────────────────────────────────────────────────

  /**
   * Get a snapshot from the camera. Priority order:
   * 1. RTSP + ffmpeg (most reliable for any firmware)
   * 2. ONVIF snapshot endpoint
   * 3. Tapo stok API (only works on older firmware)
   * 4. Direct HTTP ports
   */
  async getSnapshot(ip: string, cameraRtspUser?: string, cameraRtspPass?: string): Promise<Buffer | null> {
    // Method 1: ffmpeg + RTSP (most reliable) — requires per-camera credentials
    if (this.ffmpegAvailable && cameraRtspUser && cameraRtspPass) {
      const buf = await this.getSnapshotViaRtsp(ip, cameraRtspUser, cameraRtspPass);
      if (buf && buf.length > 500) {
        return buf;
      }
    } else if (this.ffmpegAvailable && (!cameraRtspUser || !cameraRtspPass)) {
      this.logger.warn(`Skipping RTSP snapshot for ${ip}: no RTSP credentials configured`);
    }

    // Method 2: ONVIF snapshot
    const onvifBuf = await this.getSnapshotViaOnvif(ip);
    if (onvifBuf && this.isJpeg(onvifBuf)) {
      this.logger.debug(`Snapshot via ONVIF OK for ${ip} (${onvifBuf.length} bytes)`);
      return onvifBuf;
    }

    // Method 3: Tapo stok API (older firmware only)
    try {
      const stok = await this.authenticate(ip);
      const cached = this.sessions.get(ip);
      const baseUrl = cached ? `${cached.protocol}://${ip}` : `http://${ip}`;

      const res = await tapoFetch(`${baseUrl}/stok=${stok}/ds`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          method: 'multipleRequest',
          params: {
            requests: [{ method: 'getImage', params: { image: { name: ['main'] } } }],
          },
        }),
        timeout: 10000,
      });

      if (res.ok) {
        const buf = await res.buffer();
        if (this.isJpeg(buf)) {
          this.logger.debug(`Snapshot via Tapo API OK for ${ip} (${buf.length} bytes)`);
          return buf;
        }
      }
    } catch (error) {
      this.logger.debug(`Snapshot via Tapo API failed for ${ip}: ${error.message}`);
    }

    // Method 4: Direct HTTP snapshot on common ports
    for (const port of [80, 8080, 2020]) {
      try {
        const res = await tapoFetch(`http://${ip}:${port}/snapshot`, { timeout: 5000 });
        if (res.ok) {
          const buf = await res.buffer();
          if (this.isJpeg(buf)) {
            this.logger.debug(`Snapshot via :${port}/snapshot OK for ${ip}`);
            return buf;
          }
        }
      } catch { /* try next */ }
    }

    this.logger.warn(`All snapshot methods failed for ${ip}`);
    return null;
  }

  /**
   * Grab a single frame from RTSP stream using ffmpeg.
   * This is the most reliable method — works with ANY Tapo firmware.
   */
  private async getSnapshotViaRtsp(ip: string, cameraRtspUser?: string, cameraRtspPass?: string): Promise<Buffer | null> {
    const urls = this.getStreamUrls(ip, cameraRtspUser, cameraRtspPass);
    // Try sub-stream first (lighter, faster to decode)
    for (const rtspUrl of [urls.rtspSub, urls.rtspMain]) {
      try {
        const tmpFile = path.join(os.tmpdir(), `tapo-snap-${ip.replace(/\./g, '_')}-${Date.now()}.jpg`);

        await execFileAsync('ffmpeg', [
          '-y',                          // overwrite
          '-rtsp_transport', 'tcp',      // TCP is more reliable than UDP
          '-i', rtspUrl,                 // RTSP input
          '-vframes', '1',               // grab 1 frame
          '-q:v', '2',                   // JPEG quality (2 = high)
          '-f', 'image2',                // output format
          tmpFile,
        ], { timeout: 10000 });

        // Read the file
        const buf = await fs.promises.readFile(tmpFile);
        // Clean up
        fs.promises.unlink(tmpFile).catch(() => {});

        if (buf.length > 500 && this.isJpeg(buf)) {
          this.logger.debug(`Snapshot via RTSP OK for ${ip} (${buf.length} bytes, ${rtspUrl.includes('stream2') ? 'sub' : 'main'})`);
          return buf;
        }
      } catch (error) {
        this.logger.debug(`RTSP snapshot failed for ${ip} (${rtspUrl.includes('stream2') ? 'sub' : 'main'}): ${error.message}`);
      }
    }
    return null;
  }

  private async getSnapshotViaOnvif(ip: string): Promise<Buffer | null> {
    const urls = [
      `http://${ip}:2020/onvif-http/snapshot?channel=1`,
      `http://${ip}:2020/onvif-http/snapshot`,
      `http://${ip}/onvif-http/snapshot`,
    ];

    for (const url of urls) {
      try {
        const res = await tapoFetch(url, { timeout: 5000 });
        if (res.ok) {
          const buf = await res.buffer();
          if (this.isJpeg(buf)) return buf;
        }
      } catch { /* try next */ }
    }
    return null;
  }

  // ─── Camera controls ───────────────────────────────────────────

  async setMotionDetection(ip: string, enabled: boolean, sensitivity: 'low' | 'medium' | 'high' = 'medium'): Promise<boolean> {
    try {
      const sensitivityMap = { low: '20', medium: '50', high: '80' };
      await this.executeCommand(ip, 'setMotionDetection', {
        motion_det: { enabled: enabled ? 'on' : 'off', sensitivity: sensitivityMap[sensitivity] },
      });
      return true;
    } catch { return false; }
  }

  async setLensMask(ip: string, enabled: boolean): Promise<boolean> {
    try {
      await this.executeCommand(ip, 'setLensMaskConfig', {
        lens_mask: { lens_mask_info: { enabled: enabled ? 'on' : 'off' } },
      });
      return true;
    } catch { return false; }
  }

  async reboot(ip: string): Promise<boolean> {
    try {
      await this.executeCommand(ip, 'rebootDevice');
      this.sessions.delete(ip);
      return true;
    } catch { return false; }
  }

  async getLedStatus(ip: string): Promise<boolean> {
    try {
      const data = await this.executeCommand(ip, 'getLedStatus');
      return data.result?.led?.config?.enabled === 'on';
    } catch { return false; }
  }

  async setLedStatus(ip: string, enabled: boolean): Promise<boolean> {
    try {
      await this.executeCommand(ip, 'setLedStatus', {
        led: { config: { enabled: enabled ? 'on' : 'off' } },
      });
      return true;
    } catch { return false; }
  }

  // ─── Diagnostic ────────────────────────────────────────────────

  /**
   * Full diagnostic of a camera: tests every layer and returns results.
   */
  async diagnose(ip: string, cameraRtspUser?: string, cameraRtspPass?: string): Promise<Record<string, any>> {
    const result: Record<string, any> = {
      ip,
      timestamp: new Date().toISOString(),
      ping: { http: false, https: false },
      auth: { success: false, strategy: null, stok: null, error: null },
      deviceInfo: null,
      snapshot: { tapoApi: false, onvif: false, directPort: false, rtsp: false, imageSize: 0 },
      rtsp: this.getStreamUrls(ip, cameraRtspUser, cameraRtspPass),
      rtspCredentials: {
        configured: !!(cameraRtspUser && cameraRtspPass),
        username: cameraRtspUser || null,
      },
    };

    // Test ping
    try {
      await tapoFetch(`http://${ip}/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method: 'getDeviceInfo' }),
        timeout: 3000,
      });
      result.ping.http = true;
    } catch (e) { result.ping.httpError = e.message; }

    try {
      await tapoFetch(`https://${ip}/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method: 'getDeviceInfo' }),
        timeout: 3000,
      });
      result.ping.https = true;
    } catch (e) { result.ping.httpsError = e.message; }

    // Test auth
    try {
      const stok = await this.authenticate(ip);
      result.auth.success = true;
      result.auth.stok = stok.slice(0, 8) + '...';
      const cached = this.sessions.get(ip);
      result.auth.protocol = cached?.protocol;
    } catch (e) { result.auth.error = e.message; }

    // Test device info
    try {
      result.deviceInfo = await this.getDeviceInfo(ip);
    } catch (e) { result.deviceInfo = { error: e.message }; }

    // Test RTSP snapshot (most reliable) — using per-camera credentials if available
    result.ffmpegAvailable = this.ffmpegAvailable;
    if (this.ffmpegAvailable) {
      const rtspSnap = await this.getSnapshotViaRtsp(ip, cameraRtspUser, cameraRtspPass);
      if (rtspSnap) {
        result.snapshot.rtsp = true;
        result.snapshot.imageSize = rtspSnap.length;
        result.snapshot.isJpeg = this.isJpeg(rtspSnap);
      } else {
        result.snapshot.rtspError = 'ffmpeg RTSP failed — check credentials or RTSP account in Tapo app';
      }
    }

    // Test ONVIF snapshot
    const onvifSnap = await this.getSnapshotViaOnvif(ip);
    if (onvifSnap) {
      result.snapshot.onvif = true;
      if (!result.snapshot.isJpeg) {
        result.snapshot.imageSize = onvifSnap.length;
        result.snapshot.isJpeg = this.isJpeg(onvifSnap);
      }
    }

    return result;
  }

  // ─── Utils ─────────────────────────────────────────────────────

  /** Check if a buffer is a valid JPEG (starts with FF D8) */
  private isJpeg(buf: Buffer): boolean {
    return buf && buf.length > 100 && buf[0] === 0xFF && buf[1] === 0xD8;
  }

  private hashTapoPassword(password: string): string {
    return crypto.createHash('md5').update(password).digest('hex').toUpperCase();
  }
}
