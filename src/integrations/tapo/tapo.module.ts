import { Module, Global } from '@nestjs/common';
import { TapoService } from './tapo.service';

@Global()
@Module({
  providers: [TapoService],
  exports: [TapoService],
})
export class TapoModule {}
