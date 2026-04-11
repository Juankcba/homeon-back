import { Injectable } from '@nestjs/common';
import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({ namespace: '/cameras', cors: { origin: '*' } })
@Injectable()
export class CamerasGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;

  handleConnection(client: Socket) {
    console.log(`Client connected to cameras namespace: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    console.log(`Client disconnected from cameras namespace: ${client.id}`);
  }

  @SubscribeMessage('subscribe:camera')
  handleSubscribeCamera(client: Socket, data: { cameraId: string }) {
    client.join(`camera:${data.cameraId}`);
    return { status: 'subscribed' };
  }

  @SubscribeMessage('unsubscribe:camera')
  handleUnsubscribeCamera(client: Socket, data: { cameraId: string }) {
    client.leave(`camera:${data.cameraId}`);
    return { status: 'unsubscribed' };
  }

  emitCameraStatus(cameraId: string, status: 'online' | 'offline' | 'recording') {
    this.server.to(`camera:${cameraId}`).emit('camera:status', {
      cameraId,
      status,
      timestamp: new Date(),
    });
  }

  emitMotionEvent(cameraId: string, details: any) {
    this.server.to(`camera:${cameraId}`).emit('camera:motion', {
      cameraId,
      type: 'motion',
      timestamp: new Date(),
      ...details,
    });
  }

  emitStreamData(cameraId: string, streamData: any) {
    this.server.to(`camera:${cameraId}`).emit('camera:stream', {
      cameraId,
      ...streamData,
    });
  }
}
