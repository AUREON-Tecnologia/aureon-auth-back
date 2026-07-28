import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { RbacAdminService } from '../../src/modules/rbac/application/services/rbac-admin.service';
import { IRbacRepository, RBAC_REPOSITORY } from '../../src/modules/rbac/domain/repositories/rbac.repository.interface';
import { Rol } from '../../src/modules/rbac/domain/entities/rol.entity';

const TENANT_ID = 'tenant-uuid-1';

describe('RbacAdminService', () => {
  let service: RbacAdminService;
  let repo: jest.Mocked<IRbacRepository>;

  beforeEach(async () => {
    const repoMock: jest.Mocked<IRbacRepository> = {
      crearRol: jest.fn(),
      buscarRolPorCodigo: jest.fn(),
      listarRoles: jest.fn(),
      crearPermiso: jest.fn(),
      listarPermisos: jest.fn(),
      asignarPermisoARol: jest.fn(),
      crearMembresia: jest.fn(),
      buscarMembresia: jest.fn(),
      buscarMembresiaPorId: jest.fn(),
      listarMembresias: jest.fn(),
      actualizarMembresia: jest.fn(),
      asignarPermisoDirecto: jest.fn(),
      quitarPermisoDirecto: jest.fn(),
      permisosEfectivos: jest.fn(),
      tienePermisoEfectivo: jest.fn(),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [RbacAdminService, { provide: RBAC_REPOSITORY, useValue: repoMock }],
    }).compile();

    service = moduleRef.get(RbacAdminService);
    repo = moduleRef.get(RBAC_REPOSITORY);
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

  it('asignarPermisoDirecto delega al repositorio con el effect solicitado', async () => {
    await service.asignarPermisoDirecto('usr-1', 'permiso-1', 'DENY', 'admin-1', 'abuso reportado');
    expect(repo.asignarPermisoDirecto).toHaveBeenCalledWith({
      userId: 'usr-1',
      permisoId: 'permiso-1',
      effect: 'DENY',
      otorgadoPor: 'admin-1',
      razon: 'abuso reportado',
    });
  });

  it('quitarPermisoDirecto delega al repositorio', async () => {
    await service.quitarPermisoDirecto('usr-1', 'permiso-1');
    expect(repo.quitarPermisoDirecto).toHaveBeenCalledWith('usr-1', 'permiso-1');
  });
});
