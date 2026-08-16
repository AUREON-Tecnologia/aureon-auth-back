import { BadRequestException } from '@nestjs/common';
import { Response } from 'express';
import { AuthController } from '../../src/modules/auth/presentation/controllers/auth.controller';
import { AuthCommandService, AuthSessionResult } from '../../src/modules/auth/application/commands/auth-command.service';
import { AuthQueryService } from '../../src/modules/auth/application/queries/auth-query.service';
import { CookieService } from '../../src/common/services/cookie.service';
import { Usuario } from '../../src/modules/auth/domain/entities/usuario.entity';

const buildUsuario = (): Usuario =>
  new Usuario('usr-uuid-1', 'test@taller.com', 'Ana', 'Perez', null, true, null, 0, null, null, new Date('2026-01-01'));

const buildSessionResult = (): AuthSessionResult => ({
  user: buildUsuario(),
  tenantId: 'tenant-uuid-1',
  roleCode: 'administrador',
  permissions: ['clientes:listar'],
  activeModules: ['clientes'],
  accessToken: 'access-jwt',
  accessTokenExpiresAt: new Date('2026-01-01T00:30:00.000Z'),
  refreshToken: 'refresh-opaque',
  refreshExpiresAt: new Date('2026-01-31T00:00:00.000Z'),
});

describe('AuthController', () => {
  let authCommandService: jest.Mocked<Pick<AuthCommandService, 'register' | 'login' | 'refresh' | 'logout'>>;
  let authQueryService: jest.Mocked<Pick<AuthQueryService, 'getById'>>;
  let cookieService: jest.Mocked<Pick<CookieService, 'setSessionCookies' | 'clearSessionCookies'>>;
  let controller: AuthController;
  const res = {} as Response;

  beforeEach(() => {
    authCommandService = {
      register: jest.fn(),
      login: jest.fn(),
      refresh: jest.fn(),
      logout: jest.fn(),
    };
    authQueryService = { getById: jest.fn() };
    cookieService = { setSessionCookies: jest.fn(), clearSessionCookies: jest.fn() };
    controller = new AuthController(
      authCommandService as unknown as AuthCommandService,
      authQueryService as unknown as AuthQueryService,
      cookieService as unknown as CookieService,
    );
  });

  describe('register', () => {
    it('sets the session cookies after a successful registration', async () => {
      const resultado = buildSessionResult();
      authCommandService.register.mockResolvedValue(resultado);

      await controller.register(
        { email: 'a@b.com', password: 'Password123!', tenantCode: 'acme' } as never,
        '127.0.0.1',
        res,
      );

      expect(cookieService.setSessionCookies).toHaveBeenCalledWith(res, resultado);
    });
  });

  describe('login', () => {
    it('sets the session cookies after a successful login', async () => {
      const resultado = buildSessionResult();
      authCommandService.login.mockResolvedValue(resultado);

      await controller.login({ email: 'a@b.com', password: 'x', tenantCode: 'acme' } as never, '127.0.0.1', res);

      expect(cookieService.setSessionCookies).toHaveBeenCalledWith(res, resultado);
    });
  });

  describe('refresh', () => {
    it('uses the refresh_token cookie when present, ignoring the body', async () => {
      const resultado = buildSessionResult();
      authCommandService.refresh.mockResolvedValue(resultado);
      const req = { cookies: { refresh_token: 'from-cookie' } } as never;

      await controller.refresh({ refreshToken: 'from-body' } as never, '127.0.0.1', req, res);

      expect(authCommandService.refresh).toHaveBeenCalledWith('from-cookie', expect.anything());
      expect(cookieService.setSessionCookies).toHaveBeenCalledWith(res, resultado);
    });

    it('falls back to the body when there is no refresh_token cookie', async () => {
      const resultado = buildSessionResult();
      authCommandService.refresh.mockResolvedValue(resultado);
      const req = { cookies: {} } as never;

      await controller.refresh({ refreshToken: 'from-body' } as never, '127.0.0.1', req, res);

      expect(authCommandService.refresh).toHaveBeenCalledWith('from-body', expect.anything());
    });

    it('throws BadRequestException if neither the cookie nor the body has a refreshToken', async () => {
      const req = { cookies: {} } as never;

      await expect(controller.refresh({} as never, '127.0.0.1', req, res)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(authCommandService.refresh).not.toHaveBeenCalled();
    });
  });

  describe('logout', () => {
    it('clears the session cookies and uses the refresh_token cookie over the body', async () => {
      authCommandService.logout.mockResolvedValue({ message: 'Session closed successfully.' });
      const req = { cookies: { refresh_token: 'from-cookie' } } as never;

      await controller.logout({ refreshToken: 'from-body' } as never, req, res);

      expect(authCommandService.logout).toHaveBeenCalledWith('from-cookie', undefined);
      expect(cookieService.clearSessionCookies).toHaveBeenCalledWith(res);
    });

    it('prefers the Authorization header over the access_token cookie', async () => {
      authCommandService.logout.mockResolvedValue({ message: 'Session closed successfully.' });
      const req = { cookies: { refresh_token: 'r', access_token: 'from-cookie' } } as never;

      await controller.logout({ refreshToken: 'r' } as never, req, res, 'Bearer from-header');

      expect(authCommandService.logout).toHaveBeenCalledWith('r', 'from-header');
    });

    it('falls back to the access_token cookie when there is no Authorization header', async () => {
      authCommandService.logout.mockResolvedValue({ message: 'Session closed successfully.' });
      const req = { cookies: { refresh_token: 'r', access_token: 'from-cookie' } } as never;

      await controller.logout({ refreshToken: 'r' } as never, req, res);

      expect(authCommandService.logout).toHaveBeenCalledWith('r', 'from-cookie');
    });

    it('throws BadRequestException if neither the cookie nor the body has a refreshToken', async () => {
      const req = { cookies: {} } as never;

      await expect(controller.logout({} as never, req, res)).rejects.toBeInstanceOf(BadRequestException);
      expect(authCommandService.logout).not.toHaveBeenCalled();
    });
  });
});
