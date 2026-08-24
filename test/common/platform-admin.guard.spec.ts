import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { PlatformAdminGuard } from '../../src/common/guards/platform-admin.guard';

const buildContext = (user?: Record<string, unknown>): ExecutionContext =>
  ({
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  }) as unknown as ExecutionContext;

describe('PlatformAdminGuard', () => {
  let guard: PlatformAdminGuard;

  beforeEach(() => {
    guard = new PlatformAdminGuard();
  });

  it('lanza UnauthorizedException si no hay request.user (JwtAuthGuard no corrio antes)', () => {
    expect(() => guard.canActivate(buildContext(undefined))).toThrow(UnauthorizedException);
  });

  it('lanza ForbiddenException si el JWT no trae el claim platformAdmin', () => {
    expect(() => guard.canActivate(buildContext({ sub: 'usr-1' }))).toThrow(ForbiddenException);
  });

  it('lanza ForbiddenException si platformAdmin es false', () => {
    expect(() => guard.canActivate(buildContext({ sub: 'usr-1', platformAdmin: false }))).toThrow(
      ForbiddenException,
    );
  });

  it('permite el acceso si platformAdmin es true', () => {
    const result = guard.canActivate(buildContext({ sub: 'usr-1', platformAdmin: true }));
    expect(result).toBe(true);
  });
});
