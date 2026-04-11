import { Injectable } from '@nestjs/common';
import {
  WebSocketGateway as WsGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

interface SystemHealth {
  timestamp: Date;
  uptime: number;
  cpuUsage: number;
  memoryUsage: number;
  activeConnections: number;
  eventsProcessed: number;
}

@WsGateway({ namespace: '/homeon', cors: { origin: '*' } })
@Injectable()
export class HomeOnGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;

  private systemHealth: SystemHealth = {
    timestamp: new Date(),
    uptime: 0,
    cpuUsage: 0,
    memoryUsage: 0,
    activeConnections: 0,
    eventsProcessed: 0,
  };

  handleConnection(client: Socket) {
    console.log(`Client connected to /homeon namespace: ${client.id}`);
    this.systemHealth.activeConnections++;
    this.broadcastSystemHealth();
  }

  handleDisconnect(client: Socket) {
    console.log(`Client disconnected from /homeon namespace: ${client.id}`);
    this.systemHealth.activeConnections--;
    this.broadcastSystemHealth();
  }

  @SubscribeMessage('subscribe:all')
  handleSubscribeAll(client: Socket) {
    client.join('all-events');
    return { status: 'subscribed to all events' };
  }

  @SubscribeMessage('unsubscribe:all')
  handleUnsubscribeAll(client: Socket) {
    client.leave('all-events');
    return { status: 'unsubscribed from all events' };
  }

  @SubscribeMessage('subscribe:camera')
  handleSubscribeCamera(client: Socket, data: { cameraId: string }) {
    client.join(`camera:${data.cameraId}`);
    return { status: 'subscribed to camera events' };
  }

  @SubscribeMessage('subscribe:light')
  handleSubscribeLight(client: Socket, data: { lightId: string }) {
    client.join(`light:${data.lightId}`);
    return { status: 'subscribed to light events' };
  }

  @SubscribeMessage('subscribe:gate')
  handleSubscribeGate(client: Socket, data: { gateId: string }) {
    client.join(`gate:${data.gateId}`);
    return { status: 'subscribed to gate events' };
  }

  @SubscribeMessage('subscribe:ai')
  handleSubscribeAi(client: Socket) {
    client.join('ai-detections');
    return { status: 'subscribed to AI events' };
  }

  @SubscribeMessage('subscribe:automations')
  handleSubscribeAutomations(client: Socket) {
    client.join('automations');
    return { status: 'subscribed to automation events' };
  }

  @SubscribeMessage('subscribe:events')
  handleSubscribeEvents(client: Socket) {
    client.join('event-log');
    return { status: 'subscribed to event log' };
  }

  @SubscribeMessage('subscribe:health')
  handleSubscribeHealth(client: Socket) {
    client.join('system-health');
    return { status: 'subscribed to system health' };
  }

  @SubscribeMessage('ping')
  handlePing(client: Socket) {
    return { message: 'pong', timestamp: new Date() };
  }

  // Camera events
  emitCameraStatus(cameraId: string, status: 'online' | 'offline' | 'recording') {
    const event = { cameraId, status, timestamp: new Date() };
    this.server.to(`camera:${cameraId}`).emit('camera:status', event);
    this.server.to('all-events').emit('camera:status', event);
    this.systemHealth.eventsProcessed++;
  }

  emitMotionEvent(cameraId: string, details: any) {
    const event = { cameraId, type: 'motion', timestamp: new Date(), ...details };
    this.server.to(`camera:${cameraId}`).emit('camera:motion', event);
    this.server.to('all-events').emit('camera:motion', event);
    this.systemHealth.eventsProcessed++;
  }

  // Light events
  emitLightChanged(lightId: string, state: any) {
    const event = { lightId, timestamp: new Date(), ...state };
    this.server.to(`light:${lightId}`).emit('light:changed', event);
    this.server.to('all-events').emit('light:changed', event);
    this.systemHealth.eventsProcessed++;
  }

  // Gate events
  emitGateStatus(gateId: string, status: 'open' | 'closed' | 'opening' | 'closing') {
    const event = { gateId, status, timestamp: new Date() };
    this.server.to(`gate:${gateId}`).emit('gate:status', event);
    this.server.to('all-events').emit('gate:status', event);
    this.systemHealth.eventsProcessed++;
  }

  // AI events
  emitAiDetection(detection: any) {
    const event = { timestamp: new Date(), ...detection };
    this.server.to('ai-detections').emit('ai:detection', event);
    this.server.to('all-events').emit('ai:detection', event);
    this.systemHealth.eventsProcessed++;
  }

  // Automation events
  emitAutomationTriggered(automationId: string, details: any) {
    const event = { automationId, timestamp: new Date(), ...details };
    this.server.to('automations').emit('automation:triggered', event);
    this.server.to('all-events').emit('automation:triggered', event);
    this.systemHealth.eventsProcessed++;
  }

  // Event log events
  emitEventNew(eventData: any) {
    const event = { timestamp: new Date(), ...eventData };
    this.server.to('event-log').emit('event:new', event);
    this.server.to('all-events').emit('event:new', event);
    this.systemHealth.eventsProcessed++;
  }

  // System health events
  broadcastSystemHealth() {
    this.systemHealth.timestamp = new Date();
    // TODO: Update actual system metrics
    this.systemHealth.cpuUsage = Math.random() * 60;
    this.systemHealth.memoryUsage = Math.random() * 70 + 20;

    this.server.to('system-health').emit('system:health', this.systemHealth);
    this.server.to('all-events').emit('system:health', this.systemHealth);
  }

  // Periodic health broadcast
  startHealthBroadcast(intervalMs: number = 10000) {
    setInterval(() => {
      this.broadcastSystemHealth();
    }, intervalMs);
  }

  // Getter for current active connections
  getActiveConnections(): number {
    return this.systemHealth.activeConnections;
  }

  // Getter for events processed
  getEventsProcessed(): number {
    return this.systemHealth.eventsProcessed;
  }
}
