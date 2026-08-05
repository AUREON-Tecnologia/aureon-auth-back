export class Modulo {
  constructor(
    public readonly id: string,
    public readonly codigo: string,
    public readonly nombre: string,
    public readonly descripcion: string | null,
    public readonly activo: boolean,
  ) {}
}
