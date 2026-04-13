import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

/**
 * Aggregates a tiny snapshot of home state tailored for the ESP32 LCD.
 * Intentionally LOW payload – ~1 KB max – because the device has limited
 * RAM and the LCD only renders a few tiles / a weather card.
 *
 * This service pulls from existing tables (cameras, lights, gate, alarm)
 * via the repositories that already live in the app. For MVP we keep
 * cross-module access loose via raw queries against the entities; later
 * we can refactor into a shared state facade.
 */
@Injectable()
export class EdgeStateService {
  // NOTE: We avoid injecting every domain service here to keep this module
  // decoupled. Instead, we query the DB directly through repositories that
  // the host application provides at module registration time.
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

  async getWeather() {
    // In production, pull from a weather provider (Open-Meteo is free, no key).
    // For MVP we return a static payload so the LCD can render.
    const now = new Date();
    const days = ['DOM','LUN','MAR','MIE','JUE','VIE','SAB'];
    const months = ['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC'];
    const dateText = `${days[now.getDay()]} ${now.getDate()} ${months[now.getMonth()]}`;
    return {
      location: 'BUENOS AIRES',
      dateText,
      tempC: 24,
      condition: 'Nublado',
      humidity: 60,
      windKmh: 12,
      icon: 2, // partly cloudy
    };
  }
}
