import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GateControllerService } from './gate-controller.service';
import { DeviceConfig } from '../../devices/entities/device-config.entity';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([DeviceConfig])],
  providers: [GateControllerService],
  exports: [GateControllerService],
})
export class GateControllerModule {}
