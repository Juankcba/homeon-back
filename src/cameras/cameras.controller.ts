import {
  Controller, Get, Post, Put, Delete, Param, Body, Query,
  HttpCode, HttpStatus, Res, UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import {
  ApiTags, ApiOperation, ApiResponse, ApiQuery, ApiBody, ApiProduces, ApiBearerAuth,
} from '@nestjs/swagger';
import { CamerasService } from './cameras.service';
import { CameraCreateDto, CameraUpdateDto, CameraTestResultDto } from './dto/camera.dto';
import { JwtOrAiKeyGuard } from '../auth/guards/jwt-or-ai-key.guard';

@ApiTags('Cameras')
@Controller('cameras')
@UseGuards(JwtOrAiKeyGuard)
@ApiBearerAuth()
export class CamerasController {
  constructor(private camerasService: CamerasService) {}

  // ─── CRUD ────────────────────────────────────────────────────────

  @Get()
  @ApiOperation({ summary: 'List all active cameras' })
  async findAll() {
    return this.camerasService.findAll();
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get camera statistics' })
  async getStats() {
    return this.camerasService.getStats();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get camera details' })
  async findOne(@Param('id') id: string) {
    return this.camerasService.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'Add a new camera (auto-discovers model/firmware from Tapo)' })
  @ApiResponse({ status: 201, description: 'Camera created' })
  @ApiResponse({ status: 409, description: 'Duplicate IP' })
  async create(@Body() dto: CameraCreateDto) {
    return this.camerasService.create(dto);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update camera settings' })
  async update(@Param('id') id: string, @Body() dto: CameraUpdateDto) {
    return this.camerasService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Soft-delete camera (can be restored)' })
  async remove(@Param('id') id: string) {
    return this.camerasService.remove(id);
  }

  @Delete(':id/permanent')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Permanently delete camera record' })
  async destroy(@Param('id') id: string) {
    return this.camerasService.destroy(id);
  }

  // ─── Diagnostics ─────────────────────────────────────────────────

  @Post('test')
  @ApiOperation({ summary: 'Test connection to a camera IP before adding it' })
  @ApiBody({ schema: { properties: { ip: { type: 'string', example: '192.168.68.60' } } } })
  async testConnection(@Body('ip') ip: string): Promise<CameraTestResultDto> {
    return this.camerasService.testConnection(ip);
  }

  @Post(':id/rediscover')
  @ApiOperation({ summary: 'Re-discover device info (model, firmware, MAC) from camera' })
  async rediscover(@Param('id') id: string) {
    return this.camerasService.rediscover(id);
  }

  @Post('diagnose')
  @ApiOperation({ summary: 'Full diagnostic of a camera IP — tests ping, auth, device info, snapshot' })
  @ApiBody({ schema: { properties: { ip: { type: 'string', example: '192.168.68.60' } } } })
  async diagnose(@Body('ip') ip: string) {
    return this.camerasService.diagnose(ip);
  }

  @Post(':id/diagnose')
  @ApiOperation({ summary: 'Full diagnostic of an existing camera' })
  async diagnoseExisting(@Param('id') id: string) {
    return this.camerasService.diagnoseById(id);
  }

  // ─── Camera actions ──────────────────────────────────────────────

  @Post(':id/snapshot')
  @ApiOperation({ summary: 'Get a live snapshot URL' })
  async getSnapshot(@Param('id') id: string) {
    return this.camerasService.getSnapshot(id);
  }

  @Get(':id/snapshot.jpg')
  @ApiOperation({ summary: 'Proxy: serve live snapshot as JPEG image' })
  @ApiProduces('image/jpeg')
  async getSnapshotImage(@Param('id') id: string, @Res() res: Response) {
    const buffer = await this.camerasService.getSnapshotBuffer(id);
    if (buffer) {
      res.set({
        'Content-Type': 'image/jpeg',
        'Content-Length': buffer.length.toString(),
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      });
      res.send(buffer);
    } else {
      res.status(502).json({ error: 'Could not get snapshot from camera' });
    }
  }

  @Post(':id/restart')
  @ApiOperation({ summary: 'Reboot camera and poll for recovery' })
  async restart(@Param('id') id: string) {
    const success = await this.camerasService.restart(id);
    return { success };
  }

  @Get(':id/stream-url')
  @ApiOperation({ summary: 'Get RTSP/HLS stream URLs' })
  async getStreamUrl(@Param('id') id: string) {
    return this.camerasService.getStreamUrl(id);
  }

  @Post(':id/motion-detection')
  @ApiOperation({ summary: 'Enable or disable motion detection' })
  @ApiBody({ schema: { properties: { enabled: { type: 'boolean' } } } })
  async setMotionDetection(@Param('id') id: string, @Body('enabled') enabled: boolean) {
    const success = await this.camerasService.setMotionDetection(id, enabled);
    return { success };
  }

  @Post(':id/lens-mask')
  @ApiOperation({ summary: 'Enable or disable privacy lens mask' })
  @ApiBody({ schema: { properties: { enabled: { type: 'boolean' } } } })
  async setLensMask(@Param('id') id: string, @Body('enabled') enabled: boolean) {
    const success = await this.camerasService.setLensMask(id, enabled);
    return { success };
  }

  @Get(':id/led')
  @ApiOperation({ summary: 'Get LED status indicator state' })
  async getLedStatus(@Param('id') id: string) {
    const enabled = await this.camerasService.getLedStatus(id);
    return { enabled };
  }

  @Post(':id/led')
  @ApiOperation({ summary: 'Toggle LED status indicator' })
  @ApiBody({ schema: { properties: { enabled: { type: 'boolean' } } } })
  async setLedStatus(@Param('id') id: string, @Body('enabled') enabled: boolean) {
    const success = await this.camerasService.setLedStatus(id, enabled);
    return { success };
  }

  // ─── Events ──────────────────────────────────────────────────────

  @Get(':id/events')
  @ApiOperation({ summary: 'Get camera events timeline' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getEvents(@Param('id') id: string, @Query('limit') limit?: number) {
    return this.camerasService.getEvents(id, limit);
  }
}
