import { Injectable, Logger } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { EdgeDevice } from './entities/edge-device.entity';
import { CamerasService } from '../cameras/cameras.service';
import { LightsService } from '../lights/lights.service';
import { GateService } from '../gate/gate.service';
import { AlarmService } from '../alarm/alarm.service';
import { EventsService } from '../events/events.service';

/**
 * Aggregates a tiny snapshot of home state tailored for the ESP32 LCD.
 * Intentionally LOW payload – ~1 KB max – because the device has limited
 * RAM and the LCD only renders a few tiles / a weather card.
 */
@Injectable()
export class EdgeStateService {
  private readonly logger = new Logger('EdgeStateService');
  /** simple in-memory cache: key = `${lat},${lon}` → { expiresAt, payload } */
  private weatherCache = new Map<string, { expiresAt: number; payload: any }>();

  constructor(private readonly moduleRef: ModuleRef) {}

  /** Lazy-resolve a service by class reference to avoid circular module imports. */
  private lookup<T>(cls: any): T | null {
    try {
      return this.moduleRef.get(cls, { strict: false }) as T;
    } catch (e: any) {
      this.logger.debug(`Edge state lookup ${cls?.name} failed: ${e?.message}`);
      return null;
    }
  }

  async getHomeState() {
    const now = new Date();
    const time = now.toTimeString().slice(0, 5);

    const cameras = this.lookup<CamerasService>(CamerasService);
    const lights  = this.lookup<LightsService>(LightsService);
    const gate    = this.lookup<GateService>(GateService);
    const alarm   = this.lookup<AlarmService>(AlarmService);
    const events  = this.lookup<EventsService>(EventsService);

    // Run everything in parallel, tolerate partial failures
    const [camStats, lightStats, gateStatus, alarmSummary, lastEvt] =
      await Promise.all([
        cameras?.getStats?.().catch(() => null) ?? null,
        lights?.getStats?.().catch(() => null) ?? null,
        gate?.getStatus?.().catch(() => null) ?? null,
        alarm?.getSummary?.().catch(() => null) ?? null,
        events?.findAll?.({ limit: 1, page: 1 }).catch(() => null) ?? null,
      ]);

    // Alarm mode: if any alarm is armed, consider the house armed
    let alarmMode: 'arm' | 'disarm' | 'home' | 'sos' = 'disarm';
    if (alarmSummary) {
      if (alarmSummary.alarmsTriggered > 0) alarmMode = 'sos';
      else if (alarmSummary.armed > 0)      alarmMode = 'arm';
      else if (alarmSummary.homeMode > 0)   alarmMode = 'home';
      else                                   alarmMode = 'disarm';
    }

    // Gate: status == 'open' or position != 0 → open
    const gateOpen = !!gateStatus && (
      gateStatus.status === 'open' ||
      gateStatus.status === 'opening' ||
      (typeof gateStatus.position === 'number' && gateStatus.position > 0)
    );

    // Last event text
    let lastEvent = '';
    let lastEventTime = '';
    const firstEvt = lastEvt?.events?.[0];
    if (firstEvt) {
      lastEvent = (firstEvt.message || firstEvt.type || '').toString();
      if (firstEvt.timestamp) {
        const d = new Date(firstEvt.timestamp);
        lastEventTime = d.toTimeString().slice(0, 5);
      }
    }
    // Strip accents so the LCD fonts render correctly
    lastEvent = lastEvent.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    return {
      time,
      alarmMode,
      gateOpen,
      camerasOnline: camStats?.online ?? 0,
      camerasTotal:  camStats?.total ?? 0,
      lightsOn:      lightStats?.onLights ?? 0,
      lightsTotal:   lightStats?.totalLights ?? 0,
      lastEvent:     lastEvent || 'Sin actividad',
      lastEventTime,
    };
  }

  async getWeather(device?: EdgeDevice | null) {
    const now = new Date();
    const days = ['DOM','LUN','MAR','MIE','JUE','VIE','SAB'];
    const months = ['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC'];
    const dateText = `${days[now.getDay()]} ${now.getDate()} ${months[now.getMonth()]}`;

    // Defaults (used as fallback when no location is configured on the device)
    const lat = device?.latitude ?? -31.4201;        // Córdoba
    const lon = device?.longitude ?? -64.1888;
    const tz  = device?.timezone || 'America/Argentina/Cordoba';
    // Strip accents so the LCD fonts (latin-1 only) can render it
    const rawName = device?.locationName || 'Cordoba';
    const locationName = rawName
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase();

    const live = await this.fetchOpenMeteo(lat, lon, tz).catch((e) => {
      this.logger.warn(`Weather fetch failed: ${e.message}`);
      return null;
    });

    if (!live) {
      return {
        location: locationName, dateText,
        tempC: 22, condition: 'Sin datos',
        humidity: 0, windKmh: 0, icon: 2,
      };
    }

    return {
      location: locationName,
      dateText,
      tempC: Math.round(live.tempC),
      condition: live.condition,
      humidity: live.humidity,
      windKmh: Math.round(live.windKmh),
      icon: live.icon,
    };
  }

  // ─── Open-Meteo (free, keyless) ──────────────────────────────────────────
  private async fetchOpenMeteo(lat: number, lon: number, tz: string) {
    const key = `${lat.toFixed(3)},${lon.toFixed(3)}`;
    const cached = this.weatherCache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.payload;

    const url = `https://api.open-meteo.com/v1/forecast`
      + `?latitude=${lat}&longitude=${lon}`
      + `&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code,is_day`
      + `&wind_speed_unit=kmh&timezone=${encodeURIComponent(tz)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`open-meteo ${res.status}`);
    const j: any = await res.json();
    const cur = j?.current;
    if (!cur) throw new Error('no current block');

    const { condition, icon } = this.mapWmo(cur.weather_code, cur.is_day);
    const asciiCondition = condition
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
    const payload = {
      tempC: cur.temperature_2m,
      humidity: cur.relative_humidity_2m,
      windKmh: cur.wind_speed_10m,
      condition: asciiCondition, icon,
    };
    // cache for 10 minutes
    this.weatherCache.set(key, { expiresAt: Date.now() + 10 * 60 * 1000, payload });
    return payload;
  }

  /** WMO weather code → (condition text, icon id used by the LCD). */
  private mapWmo(code: number, isDay: number): { condition: string; icon: number } {
    // icon ids: 0=sun, 1=cloud, 2=partly, 3=rain, 4=storm, 5=night
    if (code === 0) return isDay ? { condition: 'Despejado', icon: 0 } : { condition: 'Despejado', icon: 5 };
    if (code === 1 || code === 2) return { condition: 'Parcialmente nublado', icon: 2 };
    if (code === 3) return { condition: 'Nublado', icon: 1 };
    if (code >= 45 && code <= 48) return { condition: 'Niebla', icon: 1 };
    if (code >= 51 && code <= 57) return { condition: 'Llovizna', icon: 3 };
    if (code >= 61 && code <= 67) return { condition: 'Lluvia', icon: 3 };
    if (code >= 71 && code <= 77) return { condition: 'Nieve', icon: 1 };
    if (code >= 80 && code <= 82) return { condition: 'Chaparrón', icon: 3 };
    if (code >= 95) return { condition: 'Tormenta', icon: 4 };
    return { condition: '—', icon: 2 };
  }

  // ─── Geocoding helper used by /edge/devices/:id/location ─────────────────
  async geocode(query: string) {
    if (!query?.trim()) return [];
    const url = `https://geocoding-api.open-meteo.com/v1/search`
      + `?name=${encodeURIComponent(query)}&count=5&language=es&format=json`;
    try {
      const ctrl = new AbortController();
      const to = setTimeout(() => ctrl.abort(), 5000);
      const res = await fetch(url, { signal: ctrl.signal });
      clearTimeout(to);
      if (!res.ok) {
        this.logger.warn(`geocoding ${res.status} for "${query}"`);
        return [];
      }
      const j: any = await res.json();
      return (j?.results || []).map((r: any) => ({
        name: r.name,
        admin: [r.admin1, r.country].filter(Boolean).join(', '),
        latitude: r.latitude,
        longitude: r.longitude,
        timezone: r.timezone,
      }));
    } catch (e: any) {
      this.logger.warn(`geocoding fetch failed: ${e?.message || e}`);
      return [];
    }
  }
}
