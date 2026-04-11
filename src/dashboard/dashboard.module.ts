import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { CamerasModule } from '../cameras/cameras.module';
import { LightsModule } from '../lights/lights.module';
import { GateModule } from '../gate/gate.module';
import { AiModule } from '../ai/ai.module';
import { EventsModule } from '../events/events.module';
import { AutomationsModule } from '../automations/automations.module';
import { DevicesModule } from '../devices/devices.module';

@Module({
  imports: [
    CamerasModule,
    LightsModule,
    GateModule,
    AiModule,
    EventsModule,
    AutomationsModule,
    DevicesModule,
  ],
  controllers: [DashboardController],
})
export class DashboardModule {}
