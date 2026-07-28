export class Rol {
  constructor(
    public readonly id: string,
    public readonly tenantId: string,
    public readonly codigo: string,
    public readonly nombre: string,
    public readonly descripcion: string | null,
    public readonly activo: boolean,
    public readonly esSistema: boolean,
  ) {}
}
