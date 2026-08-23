import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CookieOptions, Response } from 'express';
import { randomBytes } from 'crypto';
import { ACCESS_TOKEN_COOKIE_NAME, CSRF_TOKEN_COOKIE_NAME, REFRESH_TOKEN_COOKIE_NAME } from '@aureon/redis-client';

interface SessionCookiesInput {
  accessToken: string;
  accessTokenExpiresAt: Date;
  refreshToken: string;
  refreshExpiresAt: Date;
}

/**
 * Local a este repo (no en @aureon/redis-client): ningun otro microservicio
 * necesita reconocer esta cookie, es un detalle interno del flujo de
 * seleccion de tenant de Identity. Ver CLAUDE.md, "Seleccion de tenant en
 * login".
 */
export const TENANT_SELECTION_COOKIE_NAME = 'tenant_selection_token';
export const TENANT_SELECTION_TTL_SECONDS = 300;

/**
 * Sole issuer of the session cookies (access_token/refresh_token/csrf_token,
 * names defined in @aureon/redis-client) and of tenant_selection_token. See
 * CLAUDE.md, "Autenticacion por cookie" section, for the full design
 * (shared domain, attributes per cookie, CSRF double-submit).
 */
@Injectable()
export class CookieService {
  constructor(private readonly configService: ConfigService) {}

  setSessionCookies(res: Response, session: SessionCookiesInput): void {
    const base = this.baseOptions();

    res.cookie(ACCESS_TOKEN_COOKIE_NAME, session.accessToken, {
      ...base,
      httpOnly: true,
      path: '/',
      expires: session.accessTokenExpiresAt,
    });

    res.cookie(REFRESH_TOKEN_COOKIE_NAME, session.refreshToken, {
      ...base,
      httpOnly: true,
      path: '/auth',
      expires: session.refreshExpiresAt,
    });

    // Not httpOnly: the frontend must be able to read it to send it back
    // as the X-CSRF-Token header (double-submit cookie, see CsrfGuard).
    res.cookie(CSRF_TOKEN_COOKIE_NAME, randomBytes(32).toString('hex'), {
      ...base,
      httpOnly: false,
      path: '/',
      expires: session.accessTokenExpiresAt,
    });
  }

  clearSessionCookies(res: Response): void {
    const base = this.baseOptions();
    res.clearCookie(ACCESS_TOKEN_COOKIE_NAME, { ...base, path: '/' });
    res.clearCookie(REFRESH_TOKEN_COOKIE_NAME, { ...base, path: '/auth' });
    res.clearCookie(CSRF_TOKEN_COOKIE_NAME, { ...base, path: '/' });
  }

  /** Emitida por login: identifica al usuario para POST /auth/switch-tenant sin abrir sesion. */
  setTenantSelectionCookie(res: Response, selectionToken: string): void {
    res.cookie(TENANT_SELECTION_COOKIE_NAME, selectionToken, {
      ...this.baseOptions(),
      httpOnly: true,
      path: '/auth/switch-tenant',
      expires: new Date(Date.now() + TENANT_SELECTION_TTL_SECONDS * 1000),
    });
  }

  clearTenantSelectionCookie(res: Response): void {
    res.clearCookie(TENANT_SELECTION_COOKIE_NAME, { ...this.baseOptions(), path: '/auth/switch-tenant' });
  }

  private baseOptions(): Pick<CookieOptions, 'domain' | 'sameSite' | 'secure'> {
    return {
      domain: this.configService.get<string>('cookie.domain'),
      sameSite: this.configService.get<'lax' | 'strict' | 'none'>('cookie.sameSite'),
      secure: this.configService.get<boolean>('cookie.secure'),
    };
  }
}
