import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Guard for the internal Python AI service.
 * Checks for X-AI-Key header matching AI_API_KEY in .env.
 * Used exclusively on POST /ai/report and GET /ai/faces/:id/photo.
 */
@Injectable()
export class AiKeyGuard implements CanActivate {
  private readonly apiKey: string;

  constructor(private config: ConfigService) {
    this.apiKey = config.get<string>('AI_API_KEY', 'changeme-ai-secret');
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const provided = request.headers['x-ai-key'];
    if (!provided || provided !== this.apiKey) {
      throw new UnauthorizedException('Invalid or missing X-AI-Key');
    }
    return true;
  }
}
