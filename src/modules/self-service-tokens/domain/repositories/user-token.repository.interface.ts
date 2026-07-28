import { TipoUserToken, UserToken } from '../entities/user-token.entity';

export const USER_TOKEN_REPOSITORY = Symbol('IUserTokenRepository');

export interface CrearUserTokenData {
  userId: string;
  tipo: TipoUserToken;
  tokenHash: string;
  expiraEn: Date;
}

/** HU_13 (reemplaza HU_08/09): respaldo de `user_tokens` (verificacion de email, reset de password, MFA setup). */
export interface IUserTokenRepository {
  crear(data: CrearUserTokenData): Promise<UserToken>;
  buscarVigentePorHash(tokenHash: string, tipo: TipoUserToken): Promise<UserToken | null>;
  marcarUsado(id: string): Promise<void>;
}
