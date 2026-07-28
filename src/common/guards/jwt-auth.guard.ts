import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { JwtPayload } from '../decorators/current-user.decorator';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
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

    try {
      const payload = await this.jwtService.verifyAsync<JwtPayload>(token, { secret });
      request.user = payload;
      return true;
    } catch {
      throw new UnauthorizedException({ codigo: 'UNAUTHORIZED', mensaje: 'Token invalido o expirado' });
    }
  }
}
