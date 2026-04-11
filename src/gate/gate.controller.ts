import { Controller, Get, Post, Put, Body, Query } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { GateService } from './gate.service';
import { GateControllerService } from '../integrations/gate-controller/gate-controller.service';

@ApiTags('Gate')
@Controller('gate')
export class GateController {
  constructor(
    private gateService: GateService,
    private gateControllerService: GateControllerService,
  ) {}

  // ═══════════════════════════════════════════════════════════
  //  MQTT Broker setup
  // ═══════════════════════════════════════════════════════════

  @Get('mqtt/status')
  @ApiOperation({ summary: 'Get MQTT broker connection info' })
  async mqttStatus() {
    return this.gateControllerService.getConnectionInfo();
  }

  @Post('mqtt/set-broker')
  @ApiOperation({ summary: 'Set MQTT broker IP and port' })
  async setBroker(@Body() body: { ip: string; mqttPort?: number }) {
    return this.gateControllerService.setBroker(body.ip, body.mqttPort);
  }

  @Post('mqtt/set-topics')
  @ApiOperation({ summary: 'Configure MQTT topics and pulse duration' })
  async setTopics(@Body() body: { gateTopic?: string; spareTopic?: string; pulseDuration?: number }) {
    return this.gateControllerService.setTopics(body.gateTopic, body.spareTopic, body.pulseDuration);
  }

  @Post('mqtt/test')
  @ApiOperation({ summary: 'Test MQTT broker connectivity' })
  async testBroker() {
    return this.gateControllerService.checkHealth();
  }

  // ═══════════════════════════════════════════════════════════
  //  Gate operations
  // ═══════════════════════════════════════════════════════════

  @Get('status')
  @ApiOperation({ summary: 'Get gate status' })
  async getStatus() {
    return this.gateService.getStatus();
  }

  @Get('config')
  @ApiOperation({ summary: 'Get gate configuration' })
  async getConfig() {
    return this.gateService.getConfig();
  }

  @Post('open')
  @ApiOperation({ summary: 'Open the gate (trigger relay pulse)' })
  async open() {
    return this.gateService.open(undefined, 'App', 'manual_app');
  }

  @Post('close')
  @ApiOperation({ summary: 'Close the gate (trigger relay pulse)' })
  async close() {
    return this.gateService.close(undefined, 'App', 'manual_app');
  }

  @Post('toggle')
  @ApiOperation({ summary: 'Toggle the gate (open if closed, close if open)' })
  async toggle() {
    const status = await this.gateService.getStatus();
    if (status.status === 'open' || status.status === 'opening') {
      return this.gateService.close(undefined, 'App', 'manual_app');
    }
    return this.gateService.open(undefined, 'App', 'manual_app');
  }

  @Post('stop')
  @ApiOperation({ summary: 'Emergency stop — cut relay immediately' })
  async stop() {
    return this.gateService.stop();
  }

  @Get('history')
  @ApiOperation({ summary: 'Get gate operation history' })
  async getHistory(@Query('limit') limit?: number) {
    return this.gateService.getHistory(limit || 50);
  }

  @Put('config')
  @ApiOperation({ summary: 'Update gate configuration' })
  async updateConfig(@Body() data: any) {
    return this.gateService.updateConfig(data);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get gate statistics for today' })
  async getStats() {
    return this.gateService.getStats();
  }
}
