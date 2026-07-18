export const SESSION_REPOSITORY = Symbol('ISessionRepository');

export interface SesionUsuario {
  id: string;
  idUsuario: string;
  expiraEn: Date;
  activa: boolean;
  creadaEn: Date;
}

export interface CreateSesionData {
  idUsuario: string;
  tokenHash: string;
  expiraEn: Date;
  ipOrigen?: string | null;
}

/** HU_01/HU_02: respaldo de identity.sesion_usuario para el refresh token opaco (rotacion + revocacion). */
export interface ISessionRepository {
  create(data: CreateSesionData): Promise<SesionUsuario>;
  findByTokenHash(tokenHash: string): Promise<SesionUsuario | null>;
  invalidate(id: string): Promise<void>;
}
