import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { AutomationsService } from './automations.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('Automations')
@Controller('automations')
export class AutomationsController {
  constructor(private automationsService: AutomationsService) {}

  @Get()
  @ApiOperation({ summary: 'Get all automations' })
  async findAll() {
    return this.automationsService.findAll();
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get automation statistics' })
  async getStats() {
    return this.automationsService.getStats();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get automation by ID' })
  async findOne(@Param('id') id: string) {
    return this.automationsService.findOne(id);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create automation' })
  async create(@Body() data: any) {
    return this.automationsService.create(data);
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update automation' })
  async update(@Param('id') id: string, @Body() data: any) {
    return this.automationsService.update(id, data);
  }

  @Post(':id/toggle')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Toggle automation enabled/disabled' })
  async toggle(@Param('id') id: string) {
    return this.automationsService.toggle(id);
  }

  @Post(':id/execute')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Manually execute automation' })
  async execute(@Param('id') id: string) {
    return this.automationsService.execute(id);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete automation' })
  async remove(@Param('id') id: string) {
    return this.automationsService.remove(id);
  }
}
