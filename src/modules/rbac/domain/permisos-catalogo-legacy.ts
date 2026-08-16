import { RolNegocio } from '../../../common/domain/rol-negocio';

export interface PermisoLegacySeed {
  codigo: string;
  nombre: string;
}

export interface ModuloLegacySeed {
  codigo: string;
  nombre: string;
  permisos: PermisoLegacySeed[];
}

/**
 * HU_12 original + HU_13 (BD real): catalogo semilla GLOBAL (modulos + sus
 * permisos) — se crea una sola vez en toda la plataforma, no por tenant (a
 * diferencia del diseño anterior donde cada tenant tenia sus propios permisos).
 * Deliberadamente minimo — solo cubre lo que ya tiene contrato OpenAPI hoy
 * (clientes.yaml, auth.yaml). Extender modulo por modulo conforme haya mas.
 */
export const MODULOS_LEGACY_SEED: ModuloLegacySeed[] = [
  {
    codigo: 'clientes',
    nombre: 'Clientes',
    permisos: [
      { codigo: 'clientes:listar', nombre: 'Listar clientes' },
      { codigo: 'clientes:crear', nombre: 'Crear clientes' },
      { codigo: 'clientes:editar', nombre: 'Editar clientes' },
      { codigo: 'clientes:eliminar', nombre: 'Eliminar clientes' },
    ],
  },
  {
    // ORPHANED ON PURPOSE: no controller consumes this today (the "usuarios"
    // CRUD was replaced by rbac/membresias). Left in the seed without
    // deleting it because it could not be confirmed whether another service
    // in the ecosystem still consumes it via the global permissions catalog
    // — see ANALISIS-matriz-permisos-auth.md (contracts repo,
    // docus/matrices-permisos/) for the detail.
    codigo: 'usuarios',
    nombre: 'Usuarios',
    permisos: [
      { codigo: 'usuarios:listar', nombre: 'Listar usuarios' },
      { codigo: 'usuarios:crear', nombre: 'Crear usuarios' },
      { codigo: 'usuarios:editar', nombre: 'Editar usuarios' },
      { codigo: 'usuarios:desactivar', nombre: 'Desactivar usuarios' },
    ],
  },
  {
    // Owning module for the permissions that protect the management of
    // roles/permisos/membresias itself (/rbac/*, not counting /modulos or
    // /rbac/modulos-tenant, which were left out of the granular model for
    // now). The Excel this matrix originated from marked these as "no formal
    // module", but Permission.moduleId is a mandatory FK in the schema —
    // there is no way to create these permissions without a real module
    // owning them.
    codigo: 'rbac-core',
    nombre: 'Administracion de acceso (RBAC)',
    permisos: [
      { codigo: 'roles:list', nombre: 'Listar roles' },
      { codigo: 'roles:create', nombre: 'Crear roles' },
      { codigo: 'roles:assign-permission', nombre: 'Asignar permiso a un rol' },
      { codigo: 'permissions:list', nombre: 'Listar permisos' },
      { codigo: 'permissions:create', nombre: 'Crear permisos' },
      { codigo: 'permissions:assign-direct', nombre: 'Asignar permiso directo a un usuario' },
      { codigo: 'permissions:revoke-direct', nombre: 'Quitar permiso directo de un usuario' },
      { codigo: 'memberships:list', nombre: 'Listar membresias' },
      { codigo: 'memberships:read', nombre: 'Obtener una membresia' },
      { codigo: 'memberships:update', nombre: 'Actualizar una membresia' },
      { codigo: 'memberships:deactivate', nombre: 'Desactivar una membresia' },
    ],
  },
];

const PERMISOS_POR_ROL_LEGACY: Record<RolNegocio, string[]> = {
  administrador: [
    'clientes:listar',
    'clientes:crear',
    'clientes:editar',
    'clientes:eliminar',
    'usuarios:listar',
    'usuarios:crear',
    'usuarios:editar',
    'usuarios:desactivar',
    'roles:list',
    'roles:create',
    'roles:assign-permission',
    'permissions:list',
    'permissions:create',
    'permissions:assign-direct',
    'permissions:revoke-direct',
    'memberships:list',
    'memberships:read',
    'memberships:update',
    'memberships:deactivate',
  ],
  administrativo: ['clientes:listar', 'clientes:crear', 'clientes:editar'],
  tecnico: [],
  cliente: [],
  sistema: [],
};

export function permisosLegacyDeRol(rol: RolNegocio): string[] {
  return PERMISOS_POR_ROL_LEGACY[rol] ?? [];
}
