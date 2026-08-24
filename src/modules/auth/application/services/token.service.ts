import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { JwtPayload } from '@aureon/redis-client';
import { parseDurationToMs } from '../../../../common/utils/duration.util';

export interface TokenPayload {
  sub: string;
  tenantId: string;
  email: string;
  roles: string[];
  permissions: string[];
  activeModules: string[];
  /** Platform-wide admin flag (decision 2026-08-23) -- read by PlatformAdminGuard, local to this repo, not part of the shared JwtPayload contract. */
  platformAdmin?: boolean;
}

export interface AccessTokenGenerated {
  token: string;
  expiresAt: Date;
  jti: string;
}

export interface OpaqueTokenGenerated {
  token: string;
  hash: string;
}

@Injectable()
export class TokenService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  generateAccessToken(payload: TokenPayload): AccessTokenGenerated {
    const jti = randomUUID();
    const token = this.jwtService.sign({ ...payload, jti });
    const expiresIn = this.configService.get<string>('jwt.expiresIn') ?? '30m';
    const expiresAt = new Date(Date.now() + parseDurationToMs(expiresIn));
    return { token, expiresAt, jti };
  }

  async verifyAccessToken(token: string): Promise<JwtPayload> {
    const secret = this.configService.get<string>('jwt.secret');
    if (!secret) {
      throw new Error('JWT secret not configured');
    }
    return this.jwtService.verifyAsync<JwtPayload>(token, { secret });
  }

  /**
   * Decodes an access token for logout purposes: accepts already-expired
   * tokens (ignoreExpiration) because the only thing that matters is
   * extracting the jti to delete its Redis session; an invalid signature or
   * a malformed token simply has no session to delete (returns null)
   * without that blocking the rest of the logout.
   */
  decodeForLogout(token: string): JwtPayload | null {
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

  /** HU_01: opaque refresh token (not a JWT) — only its hash is persisted. */
  generateOpaqueToken(): OpaqueTokenGenerated {
    const token = randomBytes(32).toString('hex');
    return { token, hash: this.hashToken(token) };
  }

  hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
