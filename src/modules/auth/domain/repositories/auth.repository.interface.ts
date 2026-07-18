import { Usuario } from '../entities/usuario.entity';
import { Paginacion } from '../../../../common/domain/paginacion-meta';

export const AUTH_REPOSITORY = Symbol('IAuthRepository');

export interface CreateUsuarioData {
  numeroIdentificacion: string;
  idTipoNumeroIdentificacion: string;
  email: string;
  telefono: string;
  passwordHash: string;
  idUsuarioRol: string;
}

export interface UpdateUsuarioData {
  telefono?: string;
  idUsuarioRol?: string;
  activo?: boolean;
}

export interface FiltrosUsuario {
  email?: string;
  activo?: boolean;
  idUsuarioRol?: string;
}

export interface UsuarioWithPassword extends Usuario {
  passwordHash: string;
}

export interface IAuthRepository {
  findById(id: string): Promise<Usuario | null>;
  findByEmail(email: string): Promise<Usuario | null>;
  findByEmailWithPassword(email: string): Promise<UsuarioWithPassword | null>;
  findByNumeroIdentificacion(numeroIdentificacion: string): Promise<Usuario | null>;
  findAll(filtros: FiltrosUsuario, paginacion: Paginacion): Promise<{ data: Usuario[]; total: number }>;
  create(data: CreateUsuarioData): Promise<Usuario>;
  update(id: string, data: UpdateUsuarioData): Promise<Usuario>;
  /** HU_04: resetea intentos_fallidos/bloqueado_hasta y marca ultimo_acceso. */
  registrarLoginExitoso(id: string): Promise<void>;
  /** HU_04: persiste el nuevo contador y, si aplica, la fecha de bloqueo ya calculada por el llamador. */
  registrarIntentoFallido(id: string, intentosFallidos: number, bloqueadoHasta: Date | null): Promise<void>;
}
