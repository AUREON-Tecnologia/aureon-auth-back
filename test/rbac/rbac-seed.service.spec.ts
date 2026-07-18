import { Test, TestingModule } from '@nestjs/testing';
import { RbacSeedService } from '../../src/modules/rbac/application/services/rbac-seed.service';
import { IRbacRepository, RBAC_REPOSITORY } from '../../src/modules/rbac/domain/repositories/rbac.repository.interface';
import { Rol } from '../../src/modules/rbac/domain/entities/rol.entity';
import { Permiso } from '../../src/modules/rbac/domain/entities/permiso.entity';

const TENANT_ID = 'tenant-uuid-1';

describe('RbacSeedService', () => {
  let service: RbacSeedService;
  let repo: jest.Mocked<IRbacRepository>;
  let contadorRol = 0;
  let contadorPermiso = 0;

  beforeEach(async () => {
    contadorRol = 0;
    contadorPermiso = 0;

    const repoMock: jest.Mocked<IRbacRepository> = {
      crearRol: jest.fn().mockImplementation(async (data) => {
        contadorRol += 1;
        return new Rol(`rol-${contadorRol}`, data.tenantId, data.codigo, data.nombre, data.descripcion ?? null, true, data.esSistema ?? false);
      }),
      buscarRolPorCodigo: jest.fn(),
      listarRoles: jest.fn(),
      crearPermiso: jest.fn().mockImplementation(async (data) => {
        contadorPermiso += 1;
        return new Permiso(`permiso-${contadorPermiso}`, data.tenantId, data.codigo, data.nombre, data.recurso, data.accion, true);
      }),
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
      providers: [RbacSeedService, { provide: RBAC_REPOSITORY, useValue: repoMock }],
    }).compile();

    service = moduleRef.get(RbacSeedService);
    repo = moduleRef.get(RBAC_REPOSITORY);
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

  it('no duplica un permiso ya creado por otro rol del catalogo (dedup por codigo)', async () => {
    await service.sembrarRolesLegacy(TENANT_ID);

    // administrativo comparte clientes:listar/crear/editar con administrador —
    // solo deben crearse una vez, aunque se asignen a ambos roles.
    const codigosCreados = repo.crearPermiso.mock.calls.map((llamada) => llamada[0].codigo);
    const codigosUnicos = new Set(codigosCreados);
    expect(codigosCreados.length).toBe(codigosUnicos.size);
  });

  it('asigna cada permiso al rol correspondiente (incluye reutilizacion entre roles)', async () => {
    await service.sembrarRolesLegacy(TENANT_ID);

    const totalAsignaciones = repo.asignarPermisoARol.mock.calls.length;
    const totalPermisosCreados = repo.crearPermiso.mock.calls.length;
    // administrativo reutiliza 3 permisos ya creados por administrador -> mas asignaciones que permisos.
    expect(totalAsignaciones).toBeGreaterThan(totalPermisosCreados);
  });
});
