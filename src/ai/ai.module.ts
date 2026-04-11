import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { MulterModule } from '@nestjs/platform-express';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { AiKeyGuard } from '../auth/guards/ai-key.guard';
import { AuthorizedFace } from './entities/authorized-face.entity';
import { AuthorizedVehicle } from './entities/authorized-vehicle.entity';
import { Detection } from './entities/detection.entity';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([AuthorizedFace, AuthorizedVehicle, Detection]),
    MulterModule.register({}),
  ],
  controllers: [AiController],
  providers: [AiService, AiKeyGuard],
  exports: [AiService],
})
export class AiModule {}
