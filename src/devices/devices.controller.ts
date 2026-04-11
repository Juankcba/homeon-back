import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { DevicesService } from './devices.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('Devices')
@Controller('devices')
export class DevicesController {
  constructor(private devicesService: DevicesService) {}

  @Get()
  @ApiOperation({ summary: 'Get all devices' })
  async getDevices() {
    return this.devicesService.getDevicesList();
  }

  @Get('health')
  @ApiOperation({ summary: 'Get system health status' })
  async getHealth() {
    return this.devicesService.getSystemHealth();
  }

  @Get('zones')
  @ApiOperation({ summary: 'Get all zones' })
  async getZones() {
    return this.devicesService.getZones();
  }

  @Post('zones')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create zone' })
  async createZone(@Body() data: any) {
    return this.devicesService.createZone(data);
  }

  @Put('zones/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update zone' })
  async updateZone(@Param('id') id: string, @Body() data: any) {
    return this.devicesService.updateZone(id, data);
  }

  @Delete('zones/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete zone' })
  async deleteZone(@Param('id') id: string) {
    return this.devicesService.deleteZone(id);
  }
}
