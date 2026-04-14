import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  Param,
  Delete,
  Patch,
  UseGuards,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { EdgeService } from './edge.service';
import { EdgeStateService } from './edge-state.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('Edge Devices')
@Controller()
export class EdgeController {
  constructor(
    private readonly edge: EdgeService,
    private readonly state: EdgeStateService,
  ) {}

  // ─── Pairing (public, called by ESP) ──────────────────────────────────────

  @Post('edge/pair/request')
  @ApiOperation({ summary: 'ESP requests a pairing code (public)' })
  async requestPairing(
    @Body() body: { product: string; version?: string; mac: string; name?: string },
  ) {
    return this.edge.requestPairing(body);
  }

  @Get('edge/pair/status')
  @ApiOperation({ summary: 'ESP polls pairing status (public)' })
  async pollPairing(@Query('code') code: string) {
    return this.edge.pollPairingStatus(code);
  }

  // ─── Pairing approval + device mgmt (JWT protected) ───────────────────────

  @Get('edge/pair/pending')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List pending pairings (dashboard)' })
  listPending() {
    return this.edge.listPending();
  }

  @Post('edge/pair/approve')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Approve a pending pairing (dashboard)' })
  approve(@Body() body: { code: string }, @Req() req: any) {
    return this.edge.approvePairing(body.code, req.user?.username || 'unknown');
  }

  @Get('edge/devices')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List registered edge devices' })
  list() {
    return this.edge.listDevices();
  }

  @Delete('edge/devices/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Revoke an edge device' })
  remove(@Param('id') id: string) {
    return this.edge.deleteDevice(id);
  }

  @Patch('edge/devices/:id/location')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update the weather location for an edge device' })
  setLocation(
    @Param('id') id: string,
    @Body() body: { locationName: string; latitude: number; longitude: number; timezone?: string },
  ) {
    return this.edge.updateLocation(id, body);
  }

  @Get('edge/geocode')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Search cities (Open-Meteo geocoding)' })
  geocode(@Query('q') q: string) {
    return this.state.geocode(q || '');
  }

  // ─── State endpoints (called by ESP with its own token) ───────────────────
  //  The ESP sends Authorization: Bearer <deviceToken>. We validate it by
  //  looking up the token in edge_devices (done via EdgeTokenGuard below).
  //  For MVP we inline the lookup here using a header check.

  @Get('edge/state/home')
  @ApiOperation({ summary: 'Aggregated home state for LCD (edge token)' })
  async homeState(@Req() req: any) {
    await this.authEdge(req);
    return this.state.getHomeState();
  }

  @Get('edge/state/weather')
  @ApiOperation({ summary: 'Weather data for LCD (edge token)' })
  async weather(@Req() req: any) {
    await this.authEdge(req);
    return this.state.getWeather(req.edgeDevice);
  }

  // ─── Network scan (pushed by ESP) ────────────────────────────────────────
  @Post('edge/scan')
  @ApiOperation({ summary: 'Device pushes a LAN scan result (edge token)' })
  async pushScan(@Req() req: any, @Body() body: any) {
    await this.authEdge(req);
    await this.edge.saveScan(req.edgeDevice.id, body);
    return { ok: true, received: Array.isArray(body?.devices) ? body.devices.length : 0 };
  }

  @Get('edge/devices/:id/scan')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Fetch last LAN scan for a given edge device' })
  getScan(@Param('id') id: string) {
    return this.edge.getScan(id);
  }

  private async authEdge(req: any) {
    const h: string | undefined = req.headers?.authorization;
    if (!h?.startsWith('Bearer ')) throw new Error('Missing token');
    const token = h.slice(7);
    const dev = await this.edge.authenticateByToken(token);
    req.edgeDevice = dev;
    await this.edge.updatePresence(dev.id, { connected: true });
    return dev;
  }
}
