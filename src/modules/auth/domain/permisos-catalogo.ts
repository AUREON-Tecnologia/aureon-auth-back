import { RolNegocio } from '../../../common/domain/rol-negocio';

/**
 * HU_12: catalogo inicial de permisos por rol. Solo cubre lo que ya tiene contrato
 * OpenAPI hoy (clientes.yaml, este mismo auth.yaml) — ver docus/CONTEXTO_PROYECTO.md
 * seccion 14: 62 de 68 RF todavia no tienen contrato, asi que este catalogo debe
 * extenderse conforme existan mas modulos, no es exhaustivo.
 */
const CATALOGO_PERMISOS: Record<RolNegocio, string[]> = {
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
  sistema: ['otp:emitir', 'otp:verificar'],
};

export function permisosDeRol(rol: RolNegocio): string[] {
  return CATALOGO_PERMISOS[rol] ?? [];
}
