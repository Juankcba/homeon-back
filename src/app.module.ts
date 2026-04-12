import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { AuthModule } from './auth/auth.module';
import { CamerasModule } from './cameras/cameras.module';
import { LightsModule } from './lights/lights.module';
import { GateModule } from './gate/gate.module';
import { AiModule } from './ai/ai.module';
import { AutomationsModule } from './automations/automations.module';
import { EventsModule } from './events/events.module';
import { DevicesModule } from './devices/devices.module';
import { WebsocketModule } from './websocket/websocket.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { AlarmModule } from './alarm/alarm.module';

// Hardware integration modules (Global — available everywhere)
import { TapoModule } from './integrations/tapo/tapo.module';
import { HueModule } from './integrations/hue/hue.module';
import { GateControllerModule } from './integrations/gate-controller/gate-controller.module';
import { TuyaModule } from './integrations/tuya/tuya.module';

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

    // Database
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get('DB_HOST', 'localhost'),
        port: config.get<number>('DB_PORT', 5432),
        username: config.get('DB_USERNAME', 'homeon'),
        password: config.get('DB_PASSWORD', 'password'),
        database: config.get('DB_DATABASE', 'homeon'),
        autoLoadEntities: true,
        synchronize: config.get('NODE_ENV') !== 'production', // Only in dev
        logging: config.get('NODE_ENV') === 'development',
      }),
    }),

    // Scheduled tasks
    ScheduleModule.forRoot(),

    // Hardware integrations (Global modules)
    TapoModule,
    HueModule,
    GateControllerModule,
    TuyaModule,

    // Feature modules
    AuthModule,
    CamerasModule,
    LightsModule,
    GateModule,
    AiModule,
    AutomationsModule,
    EventsModule,
    DevicesModule,
    WebsocketModule,
    DashboardModule,
    AlarmModule,
  ],
})
export class AppModule {}
