import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AlarmController } from './alarm.controller';
import { AlarmService } from './alarm.service';
import { Alarm } from './entities/alarm.entity';
import { AlarmEvent } from './entities/alarm-event.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Alarm, AlarmEvent])],
  controllers: [AlarmController],
  providers: [AlarmService],
  exports: [AlarmService],
})
export class AlarmModule {}
