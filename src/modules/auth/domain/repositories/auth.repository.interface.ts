import { Usuario } from '../entities/usuario.entity';

export const AUTH_REPOSITORY = Symbol('IAuthRepository');

export interface CreateUsuarioData {
  numeroIdentificacion: string;
  idTipoNumeroIdentificacion: string;
  email: string;
  telefono: string;
  passwordHash: string;
  idUsuarioRol: string;
}

export interface UsuarioWithPassword extends Usuario {
  passwordHash: string;
}

export interface IAuthRepository {
  findByEmail(email: string): Promise<Usuario | null>;
  findByEmailWithPassword(email: string): Promise<UsuarioWithPassword | null>;
  findByNumeroIdentificacion(numeroIdentificacion: string): Promise<Usuario | null>;
  findByIdWithRol(numeroIdentificacion: string): Promise<Usuario | null>;
  create(data: CreateUsuarioData): Promise<Usuario>;
}