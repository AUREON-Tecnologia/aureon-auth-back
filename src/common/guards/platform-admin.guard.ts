import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import type { JwtPayload } from '@aureon/redis-client';

type JwtPayloadWithPlatformAdmin = JwtPayload & { platformAdmin?: boolean };

/**
 * Gates the cross-tenant /platform/memberships endpoints (decision
 * 2026-08-23). Must run after JwtAuthGuard (which populates
 * request.user from the already-verified JWT) -- same pattern as
 * RolesGuard from @aureon/redis-client, except it checks the
 * `platformAdmin` claim instead of a tenant-scoped role code. That claim
 * is local to this repo (see TokenService.TokenPayload) -- not part of
 * the shared JwtPayload contract, so it's read via a cast here rather
 * than by extending the shared package.
 */
@Injectable()
export class PlatformAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ user?: JwtPayloadWithPlatformAdmin }>();
    const user = request.user;
    if (!user) {
      throw new UnauthorizedException({ codigo: 'UNAUTHORIZED', mensaje: 'No autenticado' });
    }

    if (user.platformAdmin !== true) {
      throw new ForbiddenException({
        codigo: 'FORBIDDEN',
        mensaje: 'Requiere ser administrador de plataforma',
      });
    }

    return true;
  }
}
