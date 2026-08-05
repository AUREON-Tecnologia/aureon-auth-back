import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { ModulosService } from '../../src/modules/rbac/application/services/modulos.service';
import { RBAC_REPOSITORY, IRbacRepository } from '../../src/modules/rbac/domain/repositories/rbac.repository.interface';
import { Modulo } from '../../src/modules/rbac/domain/entities/modulo.entity';
import { TenantModulo } from '../../src/modules/rbac/domain/entities/tenant-modulo.entity';
import { buildRbacRepositoryMock } from './__helpers__/rbac-repository.mock';

const TENANT_ID = 'tenant-uuid-1';

describe('ModulosService', () => {
  let service: ModulosService;
  let repo: jest.Mocked<IRbacRepository>;

  beforeEach(async () => {
    repo = buildRbacRepositoryMock();

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [ModulosService, { provide: RBAC_REPOSITORY, useValue: repo }],
    }).compile();

    service = moduleRef.get(ModulosService);
  });

  describe('crearModulo', () => {
    it('crea el modulo si el codigo no existe todavia en el catalogo global', async () => {
      repo.buscarModuloPorCodigo.mockResolvedValue(null);
      const nuevo = new Modulo('modulo-1', 'inventario', 'Inventario', null, true);
      repo.crearModulo.mockResolvedValue(nuevo);

      const result = await service.crearModulo({ codigo: 'inventario', nombre: 'Inventario' });
      expect(result).toBe(nuevo);
    });

    it('lanza ConflictException si el codigo ya existe', async () => {
      repo.buscarModuloPorCodigo.mockResolvedValue(new Modulo('modulo-1', 'inventario', 'Inventario', null, true));
      await expect(service.crearModulo({ codigo: 'inventario', nombre: 'Inventario' })).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(repo.crearModulo).not.toHaveBeenCalled();
    });
  });

  it('listarModulos delega al repositorio (catalogo global)', async () => {
    const modulos = [new Modulo('modulo-1', 'clientes', 'Clientes', null, true)];
    repo.listarModulos.mockResolvedValue(modulos);
    const result = await service.listarModulos();
    expect(result).toBe(modulos);
  });

  it('activarModuloParaTenant delega al repositorio con el tenant del llamador', async () => {
    const activado = new TenantModulo(TENANT_ID, 'modulo-1', true, new Date(), null);
    repo.activarModuloParaTenant.mockResolvedValue(activado);

    const result = await service.activarModuloParaTenant(TENANT_ID, 'modulo-1');

    expect(repo.activarModuloParaTenant).toHaveBeenCalledWith(TENANT_ID, 'modulo-1');
    expect(result).toBe(activado);
  });

  it('desactivarModuloParaTenant delega al repositorio', async () => {
    await service.desactivarModuloParaTenant(TENANT_ID, 'modulo-1');
    expect(repo.desactivarModuloParaTenant).toHaveBeenCalledWith(TENANT_ID, 'modulo-1');
  });
});
