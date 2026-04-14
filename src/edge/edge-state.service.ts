import { Injectable, Logger } from '@nestjs/common';
import { EdgeDevice } from './entities/edge-device.entity';

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

  constructor() {}

  async getHomeState() {
    const now = new Date();
    // TODO: wire to real repositories (cameras, lights, gate, alarm, events)
    // Placeholder aggregator – replace with real queries once we add injections.
    return {
      time: now.toTimeString().slice(0, 5),
      alarmMode: 'disarm',
      gateOpen: false,
      camerasOnline: 4,
      camerasTotal: 4,
      lightsOn: 2,
      lightsTotal: 8,
      lastEvent: 'Sin actividad',
      lastEventTime: '',
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
    const url = `https://geocoding-api.open-meteo.com/v1/search`
      + `?name=${encodeURIComponent(query)}&count=5&language=es&format=json`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`geocoding ${res.status}`);
    const j: any = await res.json();
    return (j?.results || []).map((r: any) => ({
      name: r.name,
      admin: [r.admin1, r.country].filter(Boolean).join(', '),
      latitude: r.latitude,
      longitude: r.longitude,
      timezone: r.timezone,
    }));
  }
}
