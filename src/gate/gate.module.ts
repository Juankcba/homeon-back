import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GateController } from './gate.controller';
import { GateService } from './gate.service';
import { GateAction } from './entities/gate-action.entity';
import { GateConfig } from './entities/gate-config.entity';

@Module({
  imports: [TypeOrmModule.forFeature([GateAction, GateConfig])],
  controllers: [GateController],
  providers: [GateService],
  exports: [GateService],
})
export class GateModule {}
