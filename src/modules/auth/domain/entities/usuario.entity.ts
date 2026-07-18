import { UsuarioRol } from './usuario-rol.entity';

export class Usuario {
  constructor(
    public readonly id: string,
    public readonly numeroIdentificacion: string,
    public readonly idTipoNumeroIdentificacion: string,
    public readonly email: string,
    public readonly telefono: string,
    public readonly idUsuarioRol: string,
    public readonly activo: boolean,
    public readonly intentosFallidos: number,
    public readonly bloqueadoHasta: Date | null,
    public readonly ultimoAcceso: Date | null,
    public readonly fechaCreacion: Date,
    public readonly rol?: UsuarioRol,
  ) {}
}
