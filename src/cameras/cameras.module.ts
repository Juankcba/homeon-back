import { Module, OnModuleInit } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CamerasController } from './cameras.controller';
import { CamerasService } from './cameras.service';
import { CamerasGateway } from './cameras.gateway';
import { CameraStreamGateway } from './stream.gateway';
import { Camera } from './entities/camera.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Camera])],
  controllers: [CamerasController],
  providers: [CamerasService, CamerasGateway, CameraStreamGateway],
  exports: [CamerasService, CamerasGateway],
})
export class CamerasModule implements OnModuleInit {
  constructor(private streamGateway: CameraStreamGateway) {}

  onModuleInit() {
    this.streamGateway.start();
  }
}
