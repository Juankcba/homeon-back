import { IsString, IsOptional, IsNumber, IsBoolean, IsIP, IsEnum, IsObject, Min, Max, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// --- Sub-DTOs ---

export class CameraFeaturesDto {
  @ApiProperty({ default: true })
  @IsBoolean()
  nightVision: boolean;

  @ApiProperty({ default: true })
  @IsBoolean()
  audio: boolean;

  @ApiProperty({ default: true })
  @IsBoolean()
  motionDetection: boolean;
}

// --- Create ---

export class CameraCreateDto {
  @ApiProperty({ example: 'SAA_Comedor' })
  @IsString()
  name: string;

  @ApiProperty({ example: 'Comedor' })
  @IsString()
  location: string;

  @ApiProperty({ example: '192.168.68.60', description: 'IP address of the Tapo camera on the local network' })
  @IsIP()
  ip: string;

  @ApiPropertyOptional({ example: 'Interior', description: 'Zone label (Interior / Exterior)' })
  @IsOptional()
  @IsString()
  zone?: string;

  @ApiPropertyOptional({ example: 'Tapo C320WS', description: 'If omitted, auto-discovered from camera' })
  @IsOptional()
  @IsString()
  model?: string;

  @ApiPropertyOptional({ example: '2560x1440' })
  @IsOptional()
  @IsString()
  resolution?: string;

  @ApiPropertyOptional({ example: 30 })
  @IsOptional()
  @IsNumber()
  @Min(1) @Max(60)
  fps?: number;

  @ApiPropertyOptional({ example: 'adminc', description: 'RTSP stream username (set in Tapo app → Camera Account)' })
  @IsOptional()
  @IsString()
  rtspUsername?: string;

  @ApiPropertyOptional({ example: 'Juan4609', description: 'RTSP stream password' })
  @IsOptional()
  @IsString()
  rtspPassword?: string;
}

// --- Update ---

export class CameraUpdateDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  location?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsIP()
  ip?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  zone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  model?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  resolution?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(1) @Max(60)
  fps?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  sortOrder?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  rtspUsername?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  rtspPassword?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateNested()
  @Type(() => CameraFeaturesDto)
  features?: CameraFeaturesDto;
}

// --- Response DTOs ---

export class CameraResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiProperty() location: string;
  @ApiProperty() status: 'online' | 'offline' | 'recording';
  @ApiProperty() ip: string;
  @ApiProperty() mac: string;
  @ApiProperty() model: string;
  @ApiProperty() firmware: string;
  @ApiProperty() resolution: string;
  @ApiProperty() fps: number;
  @ApiProperty() codec: string;
  @ApiProperty() zone: string;
  @ApiProperty() features: CameraFeaturesDto;
  @ApiProperty() storageUsed: number;
  @ApiProperty() storageTotal: number;
  @ApiProperty() uptime: number;
  @ApiProperty() temperature: number;
  @ApiProperty() lastMotion: Date;
  @ApiProperty() lastPing: Date;
  @ApiProperty() createdAt: Date;
}

export class CameraSnapshotDto {
  @ApiProperty() url: string;
  @ApiProperty() timestamp: Date;
}

export class CameraStreamUrlDto {
  @ApiProperty() rtsp: string;
  @ApiProperty() http: string;
  @ApiProperty() hls: string;
}

export class CameraEventDto {
  @ApiProperty() id: string;
  @ApiProperty() type: string;
  @ApiProperty() timestamp: Date;
  @ApiProperty() description: string;
  @ApiPropertyOptional() snapshotUrl?: string;
}

export class CameraTestResultDto {
  @ApiProperty() reachable: boolean;
  @ApiProperty() authenticated: boolean;
  @ApiPropertyOptional() model?: string;
  @ApiPropertyOptional() firmware?: string;
  @ApiPropertyOptional() mac?: string;
  @ApiPropertyOptional() error?: string;
}
