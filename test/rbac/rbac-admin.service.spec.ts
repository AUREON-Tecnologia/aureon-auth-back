import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { RbacAdminService } from '../../src/modules/rbac/application/services/rbac-admin.service';
import { RBAC_REPOSITORY, IRbacRepository } from '../../src/modules/rbac/domain/repositories/rbac.repository.interface';
import { Rol } from '../../src/modules/rbac/domain/entities/rol.entity';
import { Permiso } from '../../src/modules/rbac/domain/entities/permiso.entity';
import { buildRbacRepositoryMock } from './__helpers__/rbac-repository.mock';

const TENANT_ID = 'tenant-uuid-1';

describe('RbacAdminService', () => {
  let service: RbacAdminService;
  let repo: jest.Mocked<IRbacRepository>;

  beforeEach(async () => {
    repo = buildRbacRepositoryMock();

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [RbacAdminService, { provide: RBAC_REPOSITORY, useValue: repo }],
    }).compile();

    service = moduleRef.get(RbacAdminService);
  });

  describe('crearRol', () => {
    it('crea el rol cuando el codigo no existe en el tenant', async () => {
      repo.buscarRolPorCodigo.mockResolvedValue(null);
      const nuevo = new Rol('rol-1', TENANT_ID, 'gerente', 'Gerente', null, true, false);
      repo.crearRol.mockResolvedValue(nuevo);

      const result = await service.crearRol(TENANT_ID, { codigo: 'gerente', nombre: 'Gerente' });
      expect(result).toBe(nuevo);
    });

    it('lanza ConflictException si ya existe un rol con ese codigo en el tenant', async () => {
      repo.buscarRolPorCodigo.mockResolvedValue(new Rol('rol-1', TENANT_ID, 'gerente', 'Gerente', null, true, false));
      await expect(service.crearRol(TENANT_ID, { codigo: 'gerente', nombre: 'Gerente' })).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(repo.crearRol).not.toHaveBeenCalled();
    });
  });

  describe('crearPermiso', () => {
    it('crea el permiso (catalogo global) cuando el codigo no existe todavia', async () => {
      repo.buscarPermisoPorCodigo.mockResolvedValue(null);
      const nuevo = new Permiso('permiso-1', 'modulo-1', 'reportes:ver', 'Ver reportes', true);
      repo.crearPermiso.mockResolvedValue(nuevo);

      const result = await service.crearPermiso({ moduloId: 'modulo-1', codigo: 'reportes:ver', nombre: 'Ver reportes' });
      expect(result).toBe(nuevo);
    });

    it('lanza ConflictException si el codigo ya existe (unico globalmente, no por tenant)', async () => {
      repo.buscarPermisoPorCodigo.mockResolvedValue(
        new Permiso('permiso-1', 'modulo-1', 'reportes:ver', 'Ver reportes', true),
      );
      await expect(
        service.crearPermiso({ moduloId: 'modulo-1', codigo: 'reportes:ver', nombre: 'Ver reportes' }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(repo.crearPermiso).not.toHaveBeenCalled();
    });
  });

  it('asignarPermisoDirecto delega al repositorio con tenantId y el effect solicitado', async () => {
    await service.asignarPermisoDirecto('usr-1', TENANT_ID, 'permiso-1', 'DENY', 'admin-1', 'abuso reportado');
    expect(repo.asignarPermisoDirecto).toHaveBeenCalledWith({
      userId: 'usr-1',
      tenantId: TENANT_ID,
      permisoId: 'permiso-1',
      effect: 'DENY',
      otorgadoPor: 'admin-1',
      razon: 'abuso reportado',
    });
  });

  it('quitarPermisoDirecto delega al repositorio con tenantId', async () => {
    await service.quitarPermisoDirecto('usr-1', TENANT_ID, 'permiso-1');
    expect(repo.quitarPermisoDirecto).toHaveBeenCalledWith('usr-1', TENANT_ID, 'permiso-1');
  });
});
