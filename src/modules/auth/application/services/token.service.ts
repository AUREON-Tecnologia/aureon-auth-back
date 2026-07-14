import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { JwtPayload } from '../../../../common/decorators/current-user.decorator';

export interface TokenPayload {
  sub: string;
  email: string;
  roles: string[];
}

@Injectable()
export class TokenService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  generateAccessToken(payload: TokenPayload): string {
    return this.jwtService.sign(payload);
  }

  async verifyAccessToken(token: string): Promise<JwtPayload> {
    const secret = this.configService.get<string>('jwt.secret');
    if (!secret) {
      throw new Error('JWT secret no configurado');
    }
    return this.jwtService.verifyAsync<JwtPayload>(token, { secret });
  }
}