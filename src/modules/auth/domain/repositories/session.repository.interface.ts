import { Sesion } from '../entities/sesion.entity';

export const SESSION_REPOSITORY = Symbol('ISessionRepository');

export interface CreateSesionData {
  userId: string;
  tenantId: string;
  tokenHash: string;
  expiraEn: Date;
  userAgent?: string | null;
  ipAddress?: string | null;
}

/** HU_01/02/13: respaldo de `user_sessions` (refresh token opaco, rotacion + revocacion). */
export interface ISessionRepository {
  create(data: CreateSesionData): Promise<Sesion>;
  findByTokenHash(tokenHash: string): Promise<Sesion | null>;
  invalidate(id: string): Promise<void>;
  /** Usado por password-reset: invalida todas las sesiones activas de un usuario (global, todas sus membresias). */
  invalidateAllForUser(userId: string): Promise<void>;
}
