import { Controller, Get, Post, Put, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { LightsService } from './lights.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('Lights')
@Controller('lights')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class LightsController {
  constructor(private lightsService: LightsService) {}

  // ═══════════════════════════════════════════════════════════
  //  Hue Bridge setup
  // ═══════════════════════════════════════════════════════════

  @Get('hue/status')
  @ApiOperation({ summary: 'Get Hue Bridge connection status' })
  async hueStatus() {
    return this.lightsService.getHueStatus();
  }

  @Post('hue/discover')
  @ApiOperation({ summary: 'Discover Hue Bridge on the network' })
  async hueDiscover() {
    return this.lightsService.discoverBridge();
  }

  @Post('hue/set-ip')
  @ApiOperation({ summary: 'Set Hue Bridge IP manually' })
  async hueSetIp(@Body() body: { ip: string }) {
    return this.lightsService.setBridgeIp(body.ip);
  }

  @Post('hue/pair')
  @ApiOperation({ summary: 'Pair with Hue Bridge (press link button first)' })
  async huePair() {
    return this.lightsService.pairBridge();
  }

  @Post('hue/test')
  @ApiOperation({ summary: 'Test connection to Hue Bridge' })
  async hueTest() {
    return this.lightsService.testBridge();
  }

  @Post('hue/sync')
  @ApiOperation({ summary: 'Sync lights, groups and scenes from Hue Bridge' })
  async hueSync() {
    return this.lightsService.syncFromBridge();
  }

  @Post('hue/purge-and-sync')
  @ApiOperation({ summary: 'Delete ALL lights/groups/scenes and re-import from Bridge' })
  async huePurgeAndSync() {
    return this.lightsService.purgeAndSync();
  }

  // ═══════════════════════════════════════════════════════════
  //  Lights CRUD
  // ═══════════════════════════════════════════════════════════

  @Get()
  @ApiOperation({ summary: 'List all lights' })
  async findAll() {
    return this.lightsService.findAll();
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get lights statistics' })
  async getStats() {
    return this.lightsService.getStats();
  }

  @Get('groups')
  @ApiOperation({ summary: 'List all light groups' })
  async getAllGroups() {
    return this.lightsService.getAllGroups();
  }

  @Get('scenes')
  @ApiOperation({ summary: 'List all scenes' })
  async getScenes() {
    return this.lightsService.getScenes();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get light details' })
  async findOne(@Param('id') id: string) {
    return this.lightsService.findOne(id);
  }

  @Put(':id/toggle')
  @ApiOperation({ summary: 'Toggle light on/off' })
  async toggle(@Param('id') id: string) {
    return this.lightsService.toggle(id);
  }

  @Put(':id/brightness')
  @ApiOperation({ summary: 'Set light brightness' })
  async setBrightness(@Param('id') id: string, @Body() body: { brightness: number }) {
    return this.lightsService.setBrightness(id, body.brightness);
  }

  @Put(':id/color')
  @ApiOperation({ summary: 'Set light color' })
  async setColor(@Param('id') id: string, @Body() body: { hue: number; saturation: number }) {
    return this.lightsService.setColor(id, body.hue, body.saturation);
  }

  @Put(':id/color-temp')
  @ApiOperation({ summary: 'Set light color temperature' })
  async setColorTemp(@Param('id') id: string, @Body() body: { colorTemp: number }) {
    return this.lightsService.setColorTemp(id, body.colorTemp);
  }

  // ─── Groups ─────────────────────────────────────────────
  @Get('groups/:id')
  @ApiOperation({ summary: 'Get light group details' })
  async getGroup(@Param('id') id: string) {
    return this.lightsService.findGroupOne(id);
  }

  @Put('groups/:id/toggle')
  @ApiOperation({ summary: 'Toggle light group' })
  async toggleGroup(@Param('id') id: string) {
    return this.lightsService.toggleGroup(id);
  }

  // ─── Scenes ─────────────────────────────────────────────
  @Post('scenes/:id/activate')
  @ApiOperation({ summary: 'Activate scene' })
  async activateScene(@Param('id') id: string) {
    const success = await this.lightsService.activateScene(id);
    return { success };
  }
}
