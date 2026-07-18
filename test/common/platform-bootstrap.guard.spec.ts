import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PlatformBootstrapGuard } from '../../src/common/guards/platform-bootstrap.guard';

const buildContext = (headers: Record<string, string>): ExecutionContext =>
  ({
    switchToHttp: () => ({ getRequest: () => ({ headers }) }),
  }) as unknown as ExecutionContext;

describe('PlatformBootstrapGuard', () => {
  let configService: jest.Mocked<Pick<ConfigService, 'get'>>;
  let guard: PlatformBootstrapGuard;

  beforeEach(() => {
    configService = { get: jest.fn() };
    guard = new PlatformBootstrapGuard(configService as unknown as ConfigService);
  });

  it('lanza ForbiddenException si PLATFORM_BOOTSTRAP_KEY no esta configurado', () => {
    configService.get.mockReturnValue('');
    expect(() => guard.canActivate(buildContext({}))).toThrow(ForbiddenException);
  });

  it('lanza ForbiddenException si falta el header', () => {
    configService.get.mockReturnValue('secreto-largo-de-plataforma');
    expect(() => guard.canActivate(buildContext({}))).toThrow(ForbiddenException);
  });

  it('lanza ForbiddenException si el header no coincide', () => {
    configService.get.mockReturnValue('secreto-largo-de-plataforma');
    expect(() =>
      guard.canActivate(buildContext({ 'x-platform-bootstrap-key': 'otro-valor' })),
    ).toThrow(ForbiddenException);
  });

  it('permite el acceso si el header coincide con el secreto configurado', () => {
    configService.get.mockReturnValue('secreto-largo-de-plataforma');
    const result = guard.canActivate(
      buildContext({ 'x-platform-bootstrap-key': 'secreto-largo-de-plataforma' }),
    );
    expect(result).toBe(true);
  });
});
