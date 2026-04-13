import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EdgeDevice } from './entities/edge-device.entity';
import { EdgeService } from './edge.service';
import { EdgeStateService } from './edge-state.service';
import { EdgeBridgeGateway } from './edge-bridge.gateway';
import { EdgeController } from './edge.controller';
import { AuthModule } from '../auth/auth.module';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([EdgeDevice]), AuthModule],
  controllers: [EdgeController],
  providers: [EdgeService, EdgeStateService, EdgeBridgeGateway],
  exports: [EdgeService, EdgeBridgeGateway],
})
export class EdgeModule {}
