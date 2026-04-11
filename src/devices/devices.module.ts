import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DevicesController } from './devices.controller';
import { DevicesService } from './devices.service';
import { Zone } from './entities/zone.entity';
import { DeviceConfig } from './entities/device-config.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Zone, DeviceConfig])],
  controllers: [DevicesController],
  providers: [DevicesService],
  exports: [DevicesService, TypeOrmModule.forFeature([DeviceConfig])],
})
export class DevicesModule {}
