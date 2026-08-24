export class Usuario {
  constructor(
    public readonly id: string,
    public readonly email: string,
    public readonly primerNombre: string | null,
    public readonly apellido: string | null,
    public readonly emailVerificadoEn: Date | null,
    public readonly activo: boolean,
    public readonly eliminadoEn: Date | null,
    public readonly intentosFallidos: number,
    public readonly bloqueadoHasta: Date | null,
    public readonly ultimoAcceso: Date | null,
    public readonly fechaCreacion: Date,
    /** Platform-wide admin flag (decision 2026-08-23) -- not a tenant role, see CLAUDE.md. Default so existing call sites (positional) keep compiling. */
    public readonly isPlatformAdmin: boolean = false,
  ) {}

  /** is_active=true Y no soft-eliminado. */
  get puedeAutenticar(): boolean {
    return this.activo && this.eliminadoEn === null;
  }
}
