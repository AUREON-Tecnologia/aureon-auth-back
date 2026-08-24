import { IRbacRepository } from '../../../src/modules/rbac/domain/repositories/rbac.repository.interface';

export function buildRbacRepositoryMock(): jest.Mocked<IRbacRepository> {
  return {
    crearModulo: jest.fn(),
    buscarModuloPorCodigo: jest.fn(),
    listarModulos: jest.fn(),
    activarModuloParaTenant: jest.fn(),
    desactivarModuloParaTenant: jest.fn(),
    listarModulosDeTenant: jest.fn(),
    listActiveModulesForTenant: jest.fn().mockResolvedValue([]),
    crearPermiso: jest.fn(),
    buscarPermisoPorCodigo: jest.fn(),
    listarPermisos: jest.fn(),
    getModuleCodesByPermission: jest.fn().mockResolvedValue({}),
    asignarPermisoARol: jest.fn(),
    crearRol: jest.fn(),
    buscarRolPorCodigo: jest.fn(),
    listarRoles: jest.fn(),
    crearMembresia: jest.fn(),
    buscarMembresia: jest.fn(),
    buscarMembresiaPorId: jest.fn(),
    buscarMembresiaPorIdGlobal: jest.fn(),
    contarMembresiasActivasPorRolCodigo: jest.fn(),
    listarMembresias: jest.fn(),
    listarMembresiasActivasDeUsuario: jest.fn().mockResolvedValue([]),
    actualizarMembresia: jest.fn(),
    asignarPermisoDirecto: jest.fn(),
    quitarPermisoDirecto: jest.fn(),
    permisosEfectivos: jest.fn().mockResolvedValue([]),
    tienePermisoEfectivo: jest.fn(),
  };
}
