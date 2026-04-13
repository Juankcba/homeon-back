import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { AppModule } from './app.module';
import { EdgeBridgeGateway } from './edge/edge-bridge.gateway';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // CORS
  const corsOrigins = configService.get<string>('CORS_ORIGIN', 'http://localhost:3000');
  app.enableCors({
    origin: corsOrigins.split(','),
    credentials: true,
  });

  // WebSocket adapter
  app.useWebSocketAdapter(new IoAdapter(app));

  // Swagger API docs
  const swaggerConfig = new DocumentBuilder()
    .setTitle('HomeOn API')
    .setDescription('Smart Home Backend API - Cameras, Lights, Gate, AI Recognition')
    .setVersion('1.0')
    .addBearerAuth()
    .addTag('cameras', 'Tapo camera management')
    .addTag('lights', 'Philips Hue light control')
    .addTag('gate', 'Gate/door control')
    .addTag('ai', 'Face & plate recognition')
    .addTag('automations', 'Automation rules engine')
    .addTag('events', 'Event logging & timeline')
    .addTag('auth', 'Authentication & authorization')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  // Health check endpoint (used by Docker healthcheck)
  // Verifies both server AND database connectivity
  const httpAdapter = app.getHttpAdapter();
  httpAdapter.get('/health', async (_req, res) => {
    try {
      const { DataSource } = await import('typeorm');
      const dataSource = app.get(DataSource);
      await dataSource.query('SELECT 1');
      res.status(200).json({
        status: 'ok',
        database: 'connected',
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      res.status(503).json({
        status: 'error',
        database: 'disconnected',
        error: err.message,
        timestamp: new Date().toISOString(),
      });
    }
  });

  // Start server
  const port = configService.get<number>('PORT', 3001);
  await app.listen(port);

  // Attach edge-bridge raw WebSocket gateway to the HTTP server's upgrade event
  try {
    const bridge = app.get(EdgeBridgeGateway);
    bridge.attachTo(app.getHttpServer());
  } catch (err: any) {
    console.warn('[main] edge bridge not attached:', err?.message);
  }

  console.log(`
  ╔══════════════════════════════════════════════╗
  ║           HomeOn Backend v1.0.0              ║
  ║──────────────────────────────────────────────║
  ║  REST API:  http://localhost:${port}            ║
  ║  WebSocket: ws://localhost:${port}              ║
  ║  Swagger:   http://localhost:${port}/api/docs   ║
  ║  Env:       ${configService.get('NODE_ENV', 'development').padEnd(33)}║
  ╚══════════════════════════════════════════════╝
  `);
}

bootstrap();
