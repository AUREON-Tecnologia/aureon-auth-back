import { RolNegocio } from '../../../common/domain/rol-negocio';

/**
 * HU_12 original + HU_13 (migracion): catalogo semilla usado SOLO al crear un tenant
 * nuevo (RbacSeedService), para poblar sus `permissions`/`role_permissions` iniciales
 * de los 5 roles `is_system=true`. Deliberadamente minimo — solo cubre lo que ya tiene
 * contrato OpenAPI hoy (clientes.yaml, auth.yaml). Una vez sembrado, el tenant puede
 * editar/ampliar sus propios roles y permisos via el modulo rbac; este archivo no se
 * vuelve a consultar despues del seed inicial.
 */
const CATALOGO_PERMISOS_LEGACY: Record<RolNegocio, string[]> = {
  administrador: [
    'clientes:listar',
    'clientes:crear',
    'clientes:editar',
    'clientes:eliminar',
    'usuarios:listar',
    'usuarios:crear',
    'usuarios:editar',
    'usuarios:desactivar',
  ],
  administrativo: ['clientes:listar', 'clientes:crear', 'clientes:editar'],
  tecnico: [],
  cliente: [],
  sistema: [],
};

export function permisosLegacyDeRol(rol: RolNegocio): string[] {
  return CATALOGO_PERMISOS_LEGACY[rol] ?? [];
}
