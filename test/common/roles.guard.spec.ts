import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from '../../src/common/guards/roles.guard';
import { ROLES_KEY } from '../../src/common/decorators/roles.decorator';

const buildContext = (user?: { roles: string[] }): ExecutionContext =>
  ({
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => ({}),
    getClass: () => ({}),
  }) as unknown as ExecutionContext;

describe('RolesGuard', () => {
  let reflector: jest.Mocked<Reflector>;
  let guard: RolesGuard;

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn() } as unknown as jest.Mocked<Reflector>;
    guard = new RolesGuard(reflector);
  });

  it('permite el acceso si el endpoint no declara @Roles(...)', () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);
    expect(guard.canActivate(buildContext({ roles: ['cliente'] }))).toBe(true);
  });

  it('permite el acceso si el usuario tiene uno de los roles requeridos', () => {
    reflector.getAllAndOverride.mockReturnValue(['administrador']);
    expect(guard.canActivate(buildContext({ roles: ['administrador'] }))).toBe(true);
  });

  it('lanza ForbiddenException si el usuario no tiene ninguno de los roles requeridos', () => {
    reflector.getAllAndOverride.mockReturnValue(['administrador']);
    expect(() => guard.canActivate(buildContext({ roles: ['tecnico'] }))).toThrow(ForbiddenException);
  });

  it('lanza UnauthorizedException si no hay usuario en la request (guard mal ordenado)', () => {
    reflector.getAllAndOverride.mockReturnValue(['administrador']);
    expect(() => guard.canActivate(buildContext(undefined))).toThrow(UnauthorizedException);
  });

  it('permite acceso si el usuario tiene al menos uno de varios roles permitidos', () => {
    reflector.getAllAndOverride.mockReturnValue(['administrador', 'sistema']);
    expect(guard.canActivate(buildContext({ roles: ['sistema'] }))).toBe(true);
  });
});

describe('ROLES_KEY', () => {
  it('es una clave de metadata estable', () => {
    expect(ROLES_KEY).toBe('roles');
  });
});
