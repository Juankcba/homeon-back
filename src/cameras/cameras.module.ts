import { Module, OnModuleInit } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CamerasController } from './cameras.controller';
import { CamerasService } from './cameras.service';
import { CamerasGateway } from './cameras.gateway';
import { CameraStreamGateway } from './stream.gateway';
import { Camera } from './entities/camera.entity';
import { JwtOrAiKeyGuard } from '../auth/guards/jwt-or-ai-key.guard';
import { AiKeyGuard } from '../auth/guards/ai-key.guard';

@Module({
  imports: [TypeOrmModule.forFeature([Camera])],
  controllers: [CamerasController],
  providers: [CamerasService, CamerasGateway, CameraStreamGateway, JwtOrAiKeyGuard, AiKeyGuard],
  exports: [CamerasService, CamerasGateway],
})
export class CamerasModule implements OnModuleInit {
  constructor(private streamGateway: CameraStreamGateway) {}

  onModuleInit() {
    this.streamGateway.start();
  }
}
