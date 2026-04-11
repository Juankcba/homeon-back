import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';
import { AiKeyGuard } from './ai-key.guard';

/**
 * Combined guard: allows access if EITHER JWT token OR X-AI-Key is valid.
 * Used on endpoints that need to be accessible by both:
 *   - Frontend users (JWT via cookie/header)
 *   - Python AI engine (X-AI-Key header)
 */
@Injectable()
export class JwtOrAiKeyGuard implements CanActivate {
  constructor(
    private readonly jwtGuard: JwtAuthGuard,
    private readonly aiKeyGuard: AiKeyGuard,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Try AI key first (faster check, no DB lookup)
    try {
      const aiResult = this.aiKeyGuard.canActivate(context);
      if (aiResult) return true;
    } catch {
      // AI key not present or invalid — try JWT
    }

    // Try JWT
    try {
      const jwtResult = await this.jwtGuard.canActivate(context);
      if (jwtResult) return true;
    } catch {
      // JWT not present or invalid
    }

    return false;
  }
}
