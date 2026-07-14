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
        error: 'UNAUTHORIZED',
        message: 'Missing or invalid Authorization header',
      });
    }

    const token = authHeader.substring(7);
    const secret = this.configService.get<string>('jwt.secret');

    if (!secret) {
      throw new UnauthorizedException({
        error: 'UNAUTHORIZED',
        message: 'JWT secret not configured',
      });
    }

    try {
      const payload = await this.jwtService.verifyAsync<JwtPayload>(token, { secret });
      request.user = payload;
      return true;
    } catch {
      throw new UnauthorizedException({
        error: 'UNAUTHORIZED',
        message: 'Invalid or expired token',
      });
    }
  }
}