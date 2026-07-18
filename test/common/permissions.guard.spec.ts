import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from '../../src/common/guards/permissions.guard';
import { PERMISSION_KEY } from '../../src/common/decorators/require-permission.decorator';
import { IRbacRepository } from '../../src/modules/rbac/domain/repositories/rbac.repository.interface';

const buildContext = (user?: { sub: string; tenantId: string }): ExecutionContext =>
  ({
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => ({}),
    getClass: () => ({}),
  }) as unknown as ExecutionContext;

describe('PermissionsGuard', () => {
  let reflector: jest.Mocked<Reflector>;
  let rbacRepository: jest.Mocked<Pick<IRbacRepository, 'tienePermisoEfectivo'>>;
  let guard: PermissionsGuard;

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn() } as unknown as jest.Mocked<Reflector>;
    rbacRepository = { tienePermisoEfectivo: jest.fn() };
    guard = new PermissionsGuard(reflector, rbacRepository as unknown as IRbacRepository);
  });

  it('permite el acceso si el endpoint no declara @RequirePermission(...)', async () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);
    await expect(guard.canActivate(buildContext({ sub: 'usr-1', tenantId: 'tenant-1' }))).resolves.toBe(true);
    expect(rbacRepository.tienePermisoEfectivo).not.toHaveBeenCalled();
  });

  it('permite el acceso si el usuario tiene el permiso efectivo requerido', async () => {
    reflector.getAllAndOverride.mockReturnValue('usuarios:listar');
    rbacRepository.tienePermisoEfectivo.mockResolvedValue(true);

    const result = await guard.canActivate(buildContext({ sub: 'usr-1', tenantId: 'tenant-1' }));

    expect(result).toBe(true);
    expect(rbacRepository.tienePermisoEfectivo).toHaveBeenCalledWith('usr-1', 'tenant-1', 'usuarios:listar');
  });

  it('lanza ForbiddenException si el usuario no tiene el permiso efectivo', async () => {
    reflector.getAllAndOverride.mockReturnValue('usuarios:listar');
    rbacRepository.tienePermisoEfectivo.mockResolvedValue(false);

    await expect(guard.canActivate(buildContext({ sub: 'usr-1', tenantId: 'tenant-1' }))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('lanza UnauthorizedException si no hay usuario en la request', async () => {
    reflector.getAllAndOverride.mockReturnValue('usuarios:listar');
    await expect(guard.canActivate(buildContext(undefined))).rejects.toBeInstanceOf(UnauthorizedException);
  });
});

describe('PERMISSION_KEY', () => {
  it('es una clave de metadata estable', () => {
    expect(PERMISSION_KEY).toBe('permission');
  });
});
