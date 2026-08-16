import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import { CookieService } from '../../src/common/services/cookie.service';
import { ACCESS_TOKEN_COOKIE_NAME, CSRF_TOKEN_COOKIE_NAME, REFRESH_TOKEN_COOKIE_NAME } from '@aureon/redis-client';

const CONFIG: Record<string, unknown> = {
  'cookie.domain': '.aureon.app',
  'cookie.sameSite': 'lax',
  'cookie.secure': true,
};

describe('CookieService', () => {
  let configService: { get: jest.Mock };
  let service: CookieService;
  let res: jest.Mocked<Pick<Response, 'cookie' | 'clearCookie'>>;

  beforeEach(() => {
    configService = { get: jest.fn((key: string) => CONFIG[key]) };
    service = new CookieService(configService as unknown as ConfigService);
    res = { cookie: jest.fn(), clearCookie: jest.fn() };
  });

  describe('setSessionCookies', () => {
    const accessTokenExpiresAt = new Date('2026-01-01T00:30:00.000Z');
    const refreshExpiresAt = new Date('2026-01-31T00:00:00.000Z');

    it('sets access_token as httpOnly, Path=/, with the access token expiry', () => {
      service.setSessionCookies(res as unknown as Response, {
        accessToken: 'jwt-value',
        accessTokenExpiresAt,
        refreshToken: 'refresh-value',
        refreshExpiresAt,
      });

      expect(res.cookie).toHaveBeenCalledWith(
        ACCESS_TOKEN_COOKIE_NAME,
        'jwt-value',
        expect.objectContaining({
          httpOnly: true,
          path: '/',
          expires: accessTokenExpiresAt,
          domain: '.aureon.app',
          sameSite: 'lax',
          secure: true,
        }),
      );
    });

    it('sets refresh_token as httpOnly, Path=/auth, with the refresh token expiry', () => {
      service.setSessionCookies(res as unknown as Response, {
        accessToken: 'jwt-value',
        accessTokenExpiresAt,
        refreshToken: 'refresh-value',
        refreshExpiresAt,
      });

      expect(res.cookie).toHaveBeenCalledWith(
        REFRESH_TOKEN_COOKIE_NAME,
        'refresh-value',
        expect.objectContaining({ httpOnly: true, path: '/auth', expires: refreshExpiresAt }),
      );
    });

    it('sets csrf_token as NOT httpOnly, Path=/, expiring with the access token', () => {
      service.setSessionCookies(res as unknown as Response, {
        accessToken: 'jwt-value',
        accessTokenExpiresAt,
        refreshToken: 'refresh-value',
        refreshExpiresAt,
      });

      expect(res.cookie).toHaveBeenCalledWith(
        CSRF_TOKEN_COOKIE_NAME,
        expect.any(String),
        expect.objectContaining({ httpOnly: false, path: '/', expires: accessTokenExpiresAt }),
      );
    });

    it('generates a different csrf_token value on each call', () => {
      service.setSessionCookies(res as unknown as Response, {
        accessToken: 'a',
        accessTokenExpiresAt,
        refreshToken: 'b',
        refreshExpiresAt,
      });
      service.setSessionCookies(res as unknown as Response, {
        accessToken: 'a',
        accessTokenExpiresAt,
        refreshToken: 'b',
        refreshExpiresAt,
      });

      const [firstCsrf] = res.cookie.mock.calls.find((call) => call[0] === CSRF_TOKEN_COOKIE_NAME)!;
      const csrfCalls = res.cookie.mock.calls.filter((call) => call[0] === CSRF_TOKEN_COOKIE_NAME);
      expect(csrfCalls[0][1]).not.toBe(csrfCalls[1][1]);
      expect(firstCsrf).toBe(CSRF_TOKEN_COOKIE_NAME);
    });
  });

  describe('clearSessionCookies', () => {
    it('clears all 3 cookies with matching path/domain attributes', () => {
      service.clearSessionCookies(res as unknown as Response);

      expect(res.clearCookie).toHaveBeenCalledWith(
        ACCESS_TOKEN_COOKIE_NAME,
        expect.objectContaining({ path: '/', domain: '.aureon.app' }),
      );
      expect(res.clearCookie).toHaveBeenCalledWith(
        REFRESH_TOKEN_COOKIE_NAME,
        expect.objectContaining({ path: '/auth', domain: '.aureon.app' }),
      );
      expect(res.clearCookie).toHaveBeenCalledWith(
        CSRF_TOKEN_COOKIE_NAME,
        expect.objectContaining({ path: '/', domain: '.aureon.app' }),
      );
    });
  });
});
