import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { MembresiaQueryService } from '../../src/modules/rbac/application/services/membresia-query.service';
import { IRbacRepository, RBAC_REPOSITORY } from '../../src/modules/rbac/domain/repositories/rbac.repository.interface';
import { Membresia } from '../../src/modules/rbac/domain/entities/membresia.entity';

const TENANT_ID = 'tenant-uuid-1';

describe('MembresiaQueryService', () => {
  let service: MembresiaQueryService;
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
      providers: [MembresiaQueryService, { provide: RBAC_REPOSITORY, useValue: repoMock }],
    }).compile();

    service = moduleRef.get(MembresiaQueryService);
    repo = moduleRef.get(RBAC_REPOSITORY);
  });

  describe('obtener', () => {
    it('retorna la membresia cuando existe en el tenant', async () => {
      const membresia = new Membresia('m-1', 'usr-1', TENANT_ID, 'rol-1', true, new Date(), null);
      repo.buscarMembresiaPorId.mockResolvedValue(membresia);
      const result = await service.obtener('m-1', TENANT_ID);
      expect(result).toBe(membresia);
    });

    it('lanza NotFoundException si no existe', async () => {
      repo.buscarMembresiaPorId.mockResolvedValue(null);
      await expect(service.obtener('no-existe', TENANT_ID)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('listar', () => {
    it('calcula totalPaginas a partir del total y del tamanio de pagina', async () => {
      const membresias = [
        new Membresia('m-1', 'usr-1', TENANT_ID, 'rol-1', true, new Date(), null),
        new Membresia('m-2', 'usr-2', TENANT_ID, 'rol-1', true, new Date(), null),
      ];
      repo.listarMembresias.mockResolvedValue({ data: membresias, total: 25 });

      const result = await service.listar(TENANT_ID, {}, { pagina: 2, tamanioPagina: 10 });

      expect(repo.listarMembresias).toHaveBeenCalledWith(TENANT_ID, {}, { pagina: 2, tamanioPagina: 10 });
      expect(result.meta).toEqual({ pagina: 2, tamanioPagina: 10, total: 25, totalPaginas: 3 });
    });
  });
});
