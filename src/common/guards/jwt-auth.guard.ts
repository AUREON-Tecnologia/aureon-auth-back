import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { TokenBlacklistReaderService } from '@aureon/redis-client';
import { Request } from 'express';
import { JwtPayload } from '../decorators/current-user.decorator';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly tokenBlacklist: TokenBlacklistReaderService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & { user?: JwtPayload }>();
    const authHeader = request.headers['authorization'];

    if (!authHeader || typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException({
        codigo: 'UNAUTHORIZED',
        mensaje: 'Falta el header Authorization o tiene un formato invalido',
      });
    }

    const token = authHeader.substring(7);
    const secret = this.configService.get<string>('jwt.secret');

    if (!secret) {
      throw new UnauthorizedException({ codigo: 'UNAUTHORIZED', mensaje: 'JWT secret no configurado' });
    }

    let payload: JwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(token, { secret });
    } catch {
      throw new UnauthorizedException({ codigo: 'UNAUTHORIZED', mensaje: 'Token invalido o expirado' });
    }

    if (await this.tokenBlacklist.isRevoked(payload.jti)) {
      throw new UnauthorizedException({ codigo: 'UNAUTHORIZED', mensaje: 'Token revocado' });
    }

    request.user = payload;
    return true;
  }
}
