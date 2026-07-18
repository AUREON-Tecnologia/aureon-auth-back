export class Tenant {
  constructor(
    public readonly id: string,
    public readonly codigo: string,
    public readonly nombre: string,
    public readonly activo: boolean,
    public readonly configuracion: Record<string, unknown>,
    public readonly fechaCreacion: Date,
  ) {}
}
