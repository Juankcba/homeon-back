import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { MulterModule } from '@nestjs/platform-express';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { AiKeyGuard } from '../auth/guards/ai-key.guard';
import { JwtOrAiKeyGuard } from '../auth/guards/jwt-or-ai-key.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthModule } from '../auth/auth.module';
import { AuthorizedFace } from './entities/authorized-face.entity';
import { AuthorizedVehicle } from './entities/authorized-vehicle.entity';
import { Detection } from './entities/detection.entity';
import { DeviceConfig } from '../devices/entities/device-config.entity';

@Module({
  imports: [
    ConfigModule,
    AuthModule,
    TypeOrmModule.forFeature([AuthorizedFace, AuthorizedVehicle, Detection, DeviceConfig]),
    MulterModule.register({}),
  ],
  controllers: [AiController],
  providers: [AiService, AiKeyGuard, JwtOrAiKeyGuard, JwtAuthGuard],
  exports: [AiService],
})
export class AiModule {}
