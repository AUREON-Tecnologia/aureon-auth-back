export class UsuarioRol {
  constructor(
    public readonly id: string,
    public readonly nombre: string,
    public readonly nivelPermisos: number,
  ) {}
}