import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Res,
  NotFoundException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { existsSync } from 'fs';
import { Response } from 'express';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery, ApiConsumes } from '@nestjs/swagger';
import { AiService } from './ai.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AiKeyGuard } from '../auth/guards/ai-key.guard';

const PHOTOS_DIR = process.env.PHOTOS_DIR || '/data/photos';
const SNAPSHOTS_DIR = process.env.SNAPSHOT_DIR || '/snapshots';

@ApiTags('AI Recognition')
@Controller('ai')
@UseGuards(JwtAuthGuard)          // Default: all endpoints require JWT
@ApiBearerAuth()
export class AiController {
  constructor(private aiService: AiService) {}

  // ─── Engine ──────────────────────────────────────────────────────────

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

  // ─── Faces ───────────────────────────────────────────────────────────

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
  @ApiOperation({ summary: 'Register authorized face' })
  async createFace(@Body() data: any) {
    return this.aiService.createFace(data);
  }

  @Put('faces/:id')
  @ApiOperation({ summary: 'Update authorized face' })
  async updateFace(@Param('id') id: string, @Body() data: any) {
    return this.aiService.updateFace(id, data);
  }

  @Delete('faces/:id')
  @ApiOperation({ summary: 'Delete authorized face' })
  async deleteFace(@Param('id') id: string) {
    return this.aiService.deleteFace(id);
  }

  /** Upload a face photo – accessible by both JWT users AND AI service */
  @Post('faces/:id/photo')
  @UseGuards(AiKeyGuard)   // Override: uses AI key (Python service uploads photos)
  @ApiOperation({ summary: 'Upload face photo' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('photo', {
      storage: diskStorage({
        destination: PHOTOS_DIR,
        filename: (_req, file, cb) => {
          const id = (_req as any).params.id;
          cb(null, `${id}${extname(file.originalname)}`);
        },
      }),
      fileFilter: (_req, file, cb) => {
        if (!file.mimetype.startsWith('image/')) {
          cb(new Error('Only images allowed'), false);
        } else {
          cb(null, true);
        }
      },
      limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
    }),
  )
  async uploadFacePhoto(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new NotFoundException('No file uploaded');
    const photoPath = join(PHOTOS_DIR, file.filename);
    await this.aiService.updateFace(id, { photoPath });
    return { photoPath };
  }

  /** Serve a face photo – accessible by AI service (needs photo to build encodings) */
  @Get('faces/:id/photo')
  @UseGuards(AiKeyGuard)
  @ApiOperation({ summary: 'Serve face photo for encoding' })
  async getFacePhoto(@Param('id') id: string, @Res() res: Response) {
    const face = await this.aiService.getFace(id);
    if (!face.photoPath || !existsSync(face.photoPath)) {
      throw new NotFoundException('No photo for this face');
    }
    res.sendFile(face.photoPath);
  }

  // ─── Vehicles ────────────────────────────────────────────────────────

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
  @ApiOperation({ summary: 'Register authorized vehicle' })
  async createVehicle(@Body() data: any) {
    return this.aiService.createVehicle(data);
  }

  @Put('vehicles/:id')
  @ApiOperation({ summary: 'Update authorized vehicle' })
  async updateVehicle(@Param('id') id: string, @Body() data: any) {
    return this.aiService.updateVehicle(id, data);
  }

  @Delete('vehicles/:id')
  @ApiOperation({ summary: 'Delete authorized vehicle' })
  async deleteVehicle(@Param('id') id: string) {
    return this.aiService.deleteVehicle(id);
  }

  // ─── Detections ──────────────────────────────────────────────────────

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
      authorized: authorized !== undefined ? authorized === 'true' : undefined,
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

  /** Serve snapshot image for a detection */
  @Get('detections/:id/snapshot')
  @ApiOperation({ summary: 'Serve detection snapshot image' })
  async getDetectionSnapshot(@Param('id') id: string, @Res() res: Response) {
    const det = await this.aiService.getDetection(id);
    if (!det || !det.snapshotPath || !existsSync(det.snapshotPath)) {
      throw new NotFoundException('Snapshot not found');
    }
    res.sendFile(det.snapshotPath);
  }

  // ─── Python AI Service endpoint (API key auth) ────────────────────────

  /**
   * Called by the Python AI engine to report a detection.
   * Accepts multipart/form-data with an optional snapshot image.
   * Uses X-AI-Key header (not JWT) so the Python service can call it.
   */
  @Post('report')
  @UseGuards(AiKeyGuard)   // Override default JWT guard
  @ApiOperation({ summary: 'Report detection from AI engine (internal)' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('snapshot', {
      storage: diskStorage({
        destination: (req, _file, cb) => {
          const cameraId = req.body?.cameraId || 'unknown';
          const date = new Date().toISOString().slice(0, 10).replace(/-/g, '/');
          const dir = join(SNAPSHOTS_DIR, cameraId, date);
          require('fs').mkdirSync(dir, { recursive: true });
          cb(null, dir);
        },
        filename: (_req, _file, cb) => {
          cb(null, `det_${Date.now()}.jpg`);
        },
      }),
      fileFilter: (_req, file, cb) => {
        cb(null, file.mimetype.startsWith('image/'));
      },
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  async reportDetection(
    @Body() body: any,
    @UploadedFile() snapshot?: Express.Multer.File,
  ) {
    const snapshotPath = snapshot ? snapshot.path : undefined;
    return this.aiService.createDetection({
      type: body.type,
      label: body.label,
      cameraId: body.cameraId,
      cameraName: body.cameraName,
      confidence: parseFloat(body.confidence) || 0,
      authorized: body.authorized === 'true',
      matchedFaceId: body.matchedFaceId || undefined,
      matchedVehicleId: body.matchedVehicleId || undefined,
      snapshotPath,
      boundingBox: body.boundingBox ? JSON.parse(body.boundingBox) : undefined,
      metadata: body.metadata ? JSON.parse(body.metadata) : undefined,
    });
  }
}
