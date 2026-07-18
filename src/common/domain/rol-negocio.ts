export const ROLES_NEGOCIO = [
  'administrador',
  'tecnico',
  'administrativo',
  'cliente',
  'sistema',
] as const;

export type RolNegocio = (typeof ROLES_NEGOCIO)[number];

export function esRolNegocioValido(valor: string): valor is RolNegocio {
  return (ROLES_NEGOCIO as readonly string[]).includes(valor);
}

/**
 * HU_07: identity.usuario_rol.nombre (catalogo libre en BD) debe alinearse 1:1 con
 * el enum fijo de 5 valores que exige x-roles en el resto de contratos AUREON.
 * Si el nombre de rol en BD no es uno de los 5 valores, no se puede emitir un JWT
 * cuyo rol el resto de microservicios pueda reconocer.
 */
export function resolverRolNegocio(nombreRolBd: string | undefined): RolNegocio {
  if (nombreRolBd && esRolNegocioValido(nombreRolBd)) {
    return nombreRolBd;
  }
  throw new Error(
    `El rol de base de datos "${nombreRolBd ?? '(sin rol)'}" no coincide con ninguno de los x-roles validos: ${ROLES_NEGOCIO.join(', ')}`,
  );
}
