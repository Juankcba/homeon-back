import { Module } from '@nestjs/common';
import { HomeOnGateway } from './websocket.gateway';

@Module({
  providers: [HomeOnGateway],
  exports: [HomeOnGateway],
})
export class WebsocketModule {}
