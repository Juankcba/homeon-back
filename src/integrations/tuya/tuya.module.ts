import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TuyaService } from './tuya.service';
import { DeviceConfig } from '../../devices/entities/device-config.entity';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([DeviceConfig])],
  providers: [TuyaService],
  exports: [TuyaService],
})
export class TuyaModule {}
