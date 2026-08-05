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
    codigo: 'usuarios',
    nombre: 'Usuarios',
    permisos: [
      { codigo: 'usuarios:listar', nombre: 'Listar usuarios' },
      { codigo: 'usuarios:crear', nombre: 'Crear usuarios' },
      { codigo: 'usuarios:editar', nombre: 'Editar usuarios' },
      { codigo: 'usuarios:desactivar', nombre: 'Desactivar usuarios' },
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
  ],
  administrativo: ['clientes:listar', 'clientes:crear', 'clientes:editar'],
  tecnico: [],
  cliente: [],
  sistema: [],
};

export function permisosLegacyDeRol(rol: RolNegocio): string[] {
  return PERMISOS_POR_ROL_LEGACY[rol] ?? [];
}
