import { Usuario } from '../entities/usuario.entity';

export const AUTH_REPOSITORY = Symbol('IAuthRepository');

export interface CreateUsuarioData {
  email: string;
  passwordHash: string;
  primerNombre?: string | null;
  apellido?: string | null;
}

export interface UpdateUsuarioData {
  primerNombre?: string;
  apellido?: string;
}

export interface UsuarioWithPassword extends Usuario {
  /** null = reservado para OAuth futuro (ver users.password_hash) — no puede autenticar con password. */
  passwordHash: string | null;
}

/** HU_13: respaldo de la tabla global `users` (ya no hay documento de identidad ni rol por usuario — el rol vive en user_tenant_memberships, modulo rbac). */
export interface IAuthRepository {
  findById(id: string): Promise<Usuario | null>;
  findByEmail(email: string): Promise<Usuario | null>;
  findByEmailWithPassword(email: string): Promise<UsuarioWithPassword | null>;
  create(data: CreateUsuarioData): Promise<Usuario>;
  update(id: string, data: UpdateUsuarioData): Promise<Usuario>;
  /** HU_04: resetea failed_login_attempts/locked_until y marca last_login_at. Global al usuario, no por tenant. */
  registrarLoginExitoso(id: string): Promise<void>;
  registrarIntentoFallido(id: string, intentosFallidos: number, bloqueadoHasta: Date | null): Promise<void>;
  /** Usado por self-service-tokens al verificar email / restablecer password. */
  marcarEmailVerificado(id: string): Promise<void>;
  actualizarPassword(id: string, passwordHash: string): Promise<void>;
}
