import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AlarmService } from './alarm.service';
import { TuyaService } from '../integrations/tuya/tuya.service';

@ApiTags('alarm')
@Controller('alarm')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AlarmController {
  constructor(
    private alarmService: AlarmService,
    private tuyaService: TuyaService,
  ) {}

  // ─── Tuya Setup ────────────────────────────────────────────────────────

  @Post('tuya/setup')
  @ApiOperation({ summary: 'Configure Tuya Cloud API credentials' })
  async tuyaSetup(
    @Body() body: { accessId: string; accessSecret: string; region?: string },
  ) {
    return this.tuyaService.saveConfig(
      body.accessId,
      body.accessSecret,
      body.region || 'us',
    );
  }

  @Get('tuya/status')
  @ApiOperation({ summary: 'Get Tuya connection status' })
  async tuyaStatus() {
    return this.tuyaService.getStatus();
  }

  @Post('tuya/test')
  @ApiOperation({ summary: 'Test Tuya Cloud API connection' })
  async tuyaTest() {
    return this.tuyaService.checkHealth();
  }

  @Get('tuya/discover')
  @ApiOperation({ summary: 'Discover alarm devices from Tuya account' })
  async tuyaDiscover() {
    return this.alarmService.discoverDevices();
  }

  // ─── Alarm CRUD ────────────────────────────────────────────────────────

  @Get()
  @ApiOperation({ summary: 'List all registered alarms' })
  async findAll() {
    return this.alarmService.findAll();
  }

  @Get('summary')
  @ApiOperation({ summary: 'Alarm dashboard summary' })
  async summary() {
    return this.alarmService.getSummary();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get alarm by ID' })
  async findOne(@Param('id') id: string) {
    return this.alarmService.findOne(id);
  }

  @Post('register')
  @ApiOperation({ summary: 'Register a Tuya device as managed alarm' })
  async register(
    @Body() body: { tuyaDeviceId: string; name?: string; zone?: string },
  ) {
    return this.alarmService.registerDevice(
      body.tuyaDeviceId,
      body.name,
      body.zone,
    );
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Deactivate an alarm' })
  async remove(@Param('id') id: string) {
    return this.alarmService.remove(id);
  }

  // ─── Commands ──────────────────────────────────────────────────────────

  @Post(':id/arm')
  @ApiOperation({ summary: 'Arm the alarm' })
  async arm(@Param('id') id: string) {
    return this.alarmService.setMode(id, 'arm');
  }

  @Post(':id/disarm')
  @ApiOperation({ summary: 'Disarm the alarm' })
  async disarm(@Param('id') id: string) {
    return this.alarmService.setMode(id, 'disarm');
  }

  @Post(':id/home')
  @ApiOperation({ summary: 'Set alarm to Home mode' })
  async homeMode(@Param('id') id: string) {
    return this.alarmService.setMode(id, 'home');
  }

  @Post(':id/siren')
  @ApiOperation({ summary: 'Trigger or stop siren' })
  async siren(@Param('id') id: string, @Body() body: { active: boolean }) {
    return this.alarmService.triggerSiren(id, body.active);
  }

  // ─── Sync & Events ────────────────────────────────────────────────────

  @Post(':id/sync')
  @ApiOperation({ summary: 'Sync alarm status from Tuya' })
  async sync(@Param('id') id: string) {
    return this.alarmService.syncStatus(id);
  }

  @Post('sync-all')
  @ApiOperation({ summary: 'Sync all alarms from Tuya' })
  async syncAll() {
    return this.alarmService.syncAll();
  }

  @Get(':id/events')
  @ApiOperation({ summary: 'Get alarm event history' })
  async events(
    @Param('id') id: string,
    @Query('limit') limit?: string,
  ) {
    return this.alarmService.getEvents(id, limit ? parseInt(limit, 10) : 50);
  }

  @Get('events/all')
  @ApiOperation({ summary: 'Get all alarm events' })
  async allEvents(@Query('limit') limit?: string) {
    return this.alarmService.getEvents(undefined, limit ? parseInt(limit, 10) : 50);
  }
}
