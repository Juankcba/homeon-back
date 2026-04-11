import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { AuthorizedFace } from './entities/authorized-face.entity';
import { AuthorizedVehicle } from './entities/authorized-vehicle.entity';
import { Detection } from './entities/detection.entity';

@Module({
  imports: [TypeOrmModule.forFeature([AuthorizedFace, AuthorizedVehicle, Detection])],
  controllers: [AiController],
  providers: [AiService],
  exports: [AiService],
})
export class AiModule {}
