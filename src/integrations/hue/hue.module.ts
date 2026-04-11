import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HueService } from './hue.service';
import { DeviceConfig } from '../../devices/entities/device-config.entity';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([DeviceConfig])],
  providers: [HueService],
  exports: [HueService],
})
export class HueModule {}
