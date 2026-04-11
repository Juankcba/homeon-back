import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { CamerasService } from '../cameras/cameras.service';
import { LightsService } from '../lights/lights.service';
import { GateService } from '../gate/gate.service';
import { AiService } from '../ai/ai.service';
import { EventsService } from '../events/events.service';
import { AutomationsService } from '../automations/automations.service';
import { DevicesService } from '../devices/devices.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('Dashboard')
@Controller('dashboard')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class DashboardController {
  constructor(
    private camerasService: CamerasService,
    private lightsService: LightsService,
    private gateService: GateService,
    private aiService: AiService,
    private eventsService: EventsService,
    private automationsService: AutomationsService,
    private devicesService: DevicesService,
  ) {}

  @Get('summary')
  @ApiOperation({ summary: 'Get dashboard summary with all stats' })
  async getSummary() {
    const [cameras, lights, gate, ai, events, automations, health] = await Promise.all([
      this.camerasService.getStats(),
      this.lightsService.getStats(),
      this.gateService.getStatus(),
      this.aiService.getStats(),
      this.eventsService.getStats(),
      this.automationsService.getStats(),
      this.devicesService.getSystemHealth(),
    ]);

    const recentEvents = await this.eventsService.findAll({ limit: 5 });

    return {
      cameras,
      lights,
      gate,
      ai,
      events,
      automations,
      health,
      recentEvents: recentEvents.events,
    };
  }
}
