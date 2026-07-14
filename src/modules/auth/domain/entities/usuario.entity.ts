import { UsuarioRol } from './usuario-rol.entity';

export class Usuario {
  constructor(
    public readonly numeroIdentificacion: string,
    public readonly idTipoNumeroIdentificacion: string,
    public readonly email: string,
    public readonly telefono: string,
    public readonly idUsuarioRol: string,
    public readonly activo: boolean,
    public readonly fechaCreacion: Date,
    public readonly rol?: UsuarioRol,
  ) {}

  static sinPassword(
    numeroIdentificacion: string,
    idTipoNumeroIdentificacion: string,
    email: string,
    telefono: string,
    idUsuarioRol: string,
    activo: boolean,
    fechaCreacion: Date,
    rol?: UsuarioRol,
  ): Usuario {
    return new Usuario(
      numeroIdentificacion,
      idTipoNumeroIdentificacion,
      email,
      telefono,
      idUsuarioRol,
      activo,
      fechaCreacion,
      rol,
    );
  }
}