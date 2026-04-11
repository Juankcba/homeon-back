import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { AiService } from './ai.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('AI Recognition')
@Controller('ai')
export class AiController {
  constructor(private aiService: AiService) {}

  // --- Engine ---
  @Get('engine/status')
  @ApiOperation({ summary: 'Get AI engine status' })
  async getEngineStatus() {
    return this.aiService.getEngineStatus();
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get AI statistics' })
  async getStats() {
    return this.aiService.getStats();
  }

  // --- Faces ---
  @Get('faces')
  @ApiOperation({ summary: 'Get authorized faces' })
  async getFaces() {
    return this.aiService.getFaces();
  }

  @Get('faces/:id')
  @ApiOperation({ summary: 'Get authorized face by ID' })
  async getFace(@Param('id') id: string) {
    return this.aiService.getFace(id);
  }

  @Post('faces')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Register authorized face' })
  async createFace(@Body() data: any) {
    return this.aiService.createFace(data);
  }

  @Put('faces/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update authorized face' })
  async updateFace(@Param('id') id: string, @Body() data: any) {
    return this.aiService.updateFace(id, data);
  }

  @Delete('faces/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete authorized face' })
  async deleteFace(@Param('id') id: string) {
    return this.aiService.deleteFace(id);
  }

  // --- Vehicles ---
  @Get('vehicles')
  @ApiOperation({ summary: 'Get authorized vehicles' })
  async getVehicles() {
    return this.aiService.getVehicles();
  }

  @Get('vehicles/:id')
  @ApiOperation({ summary: 'Get authorized vehicle by ID' })
  async getVehicle(@Param('id') id: string) {
    return this.aiService.getVehicle(id);
  }

  @Post('vehicles')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Register authorized vehicle' })
  async createVehicle(@Body() data: any) {
    return this.aiService.createVehicle(data);
  }

  @Put('vehicles/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update authorized vehicle' })
  async updateVehicle(@Param('id') id: string, @Body() data: any) {
    return this.aiService.updateVehicle(id, data);
  }

  @Delete('vehicles/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete authorized vehicle' })
  async deleteVehicle(@Param('id') id: string) {
    return this.aiService.deleteVehicle(id);
  }

  // --- Detections ---
  @Get('detections')
  @ApiOperation({ summary: 'Get detections with filters' })
  @ApiQuery({ name: 'type', required: false })
  @ApiQuery({ name: 'authorized', required: false, type: Boolean })
  @ApiQuery({ name: 'cameraId', required: false })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getDetections(
    @Query('type') type?: string,
    @Query('authorized') authorized?: string,
    @Query('cameraId') cameraId?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.aiService.getDetections({
      type,
      authorized: authorized ? authorized === 'true' : undefined,
      cameraId,
      page,
      limit,
    });
  }

  @Get('detections/:id')
  @ApiOperation({ summary: 'Get detection by ID' })
  async getDetection(@Param('id') id: string) {
    return this.aiService.getDetection(id);
  }
}
