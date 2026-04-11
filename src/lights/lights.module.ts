import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LightsController } from './lights.controller';
import { LightsService } from './lights.service';
import { Light } from './entities/light.entity';
import { LightGroup } from './entities/light-group.entity';
import { LightScene } from './entities/light-scene.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Light, LightGroup, LightScene])],
  controllers: [LightsController],
  providers: [LightsService],
  exports: [LightsService],
})
export class LightsModule {}
