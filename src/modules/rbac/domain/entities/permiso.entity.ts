/**
 * HU_13 (BD real): a diferencia del diseño original de scripts-v3, los permisos ya
 * NO son por tenant — son un catalogo GLOBAL organizado por modulo (`code` unico en
 * toda la plataforma). Un tenant debe tener el modulo dueño del permiso activo en
 * `tenant_modules` antes de poder asignarlo a un rol o a un usuario (lo aplica un
 * trigger en BD, no este codigo).
 */
export class Permiso {
  constructor(
    public readonly id: string,
    public readonly moduloId: string,
    public readonly codigo: string,
    public readonly nombre: string,
    public readonly activo: boolean,
  ) {}
}
