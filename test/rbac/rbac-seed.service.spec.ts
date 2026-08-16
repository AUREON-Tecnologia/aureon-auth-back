import { Test, TestingModule } from '@nestjs/testing';
import { RbacSeedService } from '../../src/modules/rbac/application/services/rbac-seed.service';
import { RBAC_REPOSITORY, IRbacRepository } from '../../src/modules/rbac/domain/repositories/rbac.repository.interface';
import { Rol } from '../../src/modules/rbac/domain/entities/rol.entity';
import { Modulo } from '../../src/modules/rbac/domain/entities/modulo.entity';
import { Permiso } from '../../src/modules/rbac/domain/entities/permiso.entity';
import { buildRbacRepositoryMock } from './__helpers__/rbac-repository.mock';

const TENANT_ID = 'tenant-uuid-1';

describe('RbacSeedService', () => {
  let service: RbacSeedService;
  let repo: jest.Mocked<IRbacRepository>;
  let contadorRol = 0;
  let modulosCreados: Map<string, Modulo>;
  let permisosCreados: Map<string, Permiso>;

  beforeEach(async () => {
    contadorRol = 0;
    modulosCreados = new Map();
    permisosCreados = new Map();

    repo = buildRbacRepositoryMock();

    repo.buscarModuloPorCodigo.mockImplementation(async (codigo) => modulosCreados.get(codigo) ?? null);
    repo.crearModulo.mockImplementation(async (data) => {
      const modulo = new Modulo(`modulo-${data.codigo}`, data.codigo, data.nombre, data.descripcion ?? null, true);
      modulosCreados.set(data.codigo, modulo);
      return modulo;
    });

    repo.buscarPermisoPorCodigo.mockImplementation(async (codigo) => permisosCreados.get(codigo) ?? null);
    repo.crearPermiso.mockImplementation(async (data) => {
      const permiso = new Permiso(`permiso-${data.codigo}`, data.moduloId, data.codigo, data.nombre, true);
      permisosCreados.set(data.codigo, permiso);
      return permiso;
    });

    repo.crearRol.mockImplementation(async (data) => {
      contadorRol += 1;
      return new Rol(`rol-${contadorRol}`, data.tenantId, data.codigo, data.nombre, data.descripcion ?? null, true, data.esSistema ?? false);
    });

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [RbacSeedService, { provide: RBAC_REPOSITORY, useValue: repo }],
    }).compile();

    service = moduleRef.get(RbacSeedService);
  });

  it('siembra el catalogo global de modulos y permisos si no existe', async () => {
    await service.sembrarRolesLegacy(TENANT_ID);

    expect(repo.crearModulo).toHaveBeenCalledWith(expect.objectContaining({ codigo: 'clients' }));
    expect(repo.crearModulo).toHaveBeenCalledWith(expect.objectContaining({ codigo: 'users' }));
    expect(repo.crearPermiso).toHaveBeenCalledWith(
      expect.objectContaining({ codigo: 'clients:list', moduloId: 'modulo-clients' }),
    );
  });

  it('reutiliza el catalogo global si ya existe (no lo vuelve a crear)', async () => {
    await service.sembrarRolesLegacy(TENANT_ID);
    repo.crearModulo.mockClear();
    repo.crearPermiso.mockClear();

    await service.sembrarRolesLegacy('tenant-uuid-2');

    expect(repo.crearModulo).not.toHaveBeenCalled();
    expect(repo.crearPermiso).not.toHaveBeenCalled();
  });

  it('activa los modulos del catalogo para el tenant', async () => {
    await service.sembrarRolesLegacy(TENANT_ID);

    expect(repo.activarModuloParaTenant).toHaveBeenCalledWith(TENANT_ID, 'modulo-clients');
    expect(repo.activarModuloParaTenant).toHaveBeenCalledWith(TENANT_ID, 'modulo-users');
  });

  it('siembra los 5 roles legacy como is_system=true', async () => {
    const mapa = await service.sembrarRolesLegacy(TENANT_ID);

    expect(repo.crearRol).toHaveBeenCalledTimes(5);
    expect(repo.crearRol).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: TENANT_ID, codigo: 'administrador', esSistema: true }),
    );
    expect(mapa.get('administrador')).toBeDefined();
    expect(mapa.get('cliente')).toBeDefined();
    expect(mapa.size).toBe(5);
  });

  it('asigna a cada rol los permisos correctos del catalogo (administrador=19, administrativo=3, resto=0)', async () => {
    await service.sembrarRolesLegacy(TENANT_ID);

    // administrador(8 clientes/usuarios + 11 rbac-core) + administrativo(3) + tecnico(0) + cliente(0) + sistema(0)
    expect(repo.asignarPermisoARol).toHaveBeenCalledTimes(22);
  });
});
