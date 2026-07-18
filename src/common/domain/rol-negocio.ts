/**
 * HU_13 (migracion multi-tenant): estos 5 nombres ya NO se validan/exigen en tiempo
 * de login (un tenant puede crear roles propios via el modulo rbac). Se mantienen
 * unicamente como catalogo semilla (RbacSeedService los crea con is_system=true en
 * cada tenant nuevo) y como tipo para los guards legacy (@Roles(...)) que siguen
 * comprobando compatibilidad con x-roles en el resto del ecosistema AUREON.
 */
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
