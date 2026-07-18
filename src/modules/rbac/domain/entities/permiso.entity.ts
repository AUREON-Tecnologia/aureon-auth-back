export class Permiso {
  constructor(
    public readonly id: string,
    public readonly tenantId: string,
    public readonly codigo: string,
    public readonly nombre: string,
    public readonly recurso: string,
    public readonly accion: string,
    public readonly activo: boolean,
  ) {}
}
