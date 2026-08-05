import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { JwtPayload } from '../../../../common/decorators/current-user.decorator';
import { parseDurationToMs } from '../../../../common/utils/duration.util';

export interface TokenPayload {
  sub: string;
  tenantId: string;
  email: string;
  roles: string[];
}

export interface AccessTokenGenerado {
  token: string;
  expiraEn: Date;
  jti: string;
}

export interface OpaqueTokenGenerado {
  token: string;
  hash: string;
}

@Injectable()
export class TokenService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  generateAccessToken(payload: TokenPayload): AccessTokenGenerado {
    const jti = randomUUID();
    const token = this.jwtService.sign({ ...payload, jti });
    const expiresIn = this.configService.get<string>('jwt.expiresIn') ?? '30m';
    const expiraEn = new Date(Date.now() + parseDurationToMs(expiresIn));
    return { token, expiraEn, jti };
  }

  async verifyAccessToken(token: string): Promise<JwtPayload> {
    const secret = this.configService.get<string>('jwt.secret');
    if (!secret) {
      throw new Error('JWT secret no configurado');
    }
    return this.jwtService.verifyAsync<JwtPayload>(token, { secret });
  }

  /**
   * Decodifica un access token para efectos de revocacion en logout: acepta
   * tokens ya expirados (ignoreExpiration) porque lo unico que interesa es
   * extraer jti/exp para poder blacklistearlo si aun le queda vida util; una
   * firma invalida o un token malformado simplemente no se puede revocar
   * (retorna null) sin que eso bloquee el resto del logout.
   */
  decodeParaRevocacion(token: string): (JwtPayload & { exp?: number }) | null {
    const secret = this.configService.get<string>('jwt.secret');
    if (!secret) {
      return null;
    }
    try {
      return this.jwtService.verify<JwtPayload>(token, { secret, ignoreExpiration: true });
    } catch {
      return null;
    }
  }

  /** HU_01: refresh token opaco (no JWT) — solo se persiste su hash. */
  generateOpaqueToken(): OpaqueTokenGenerado {
    const token = randomBytes(32).toString('hex');
    return { token, hash: this.hashToken(token) };
  }

  hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
