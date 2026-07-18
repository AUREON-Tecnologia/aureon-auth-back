import { PropositoOtp, TokenVerificacion } from '../entities/token-verificacion.entity';

export const OTP_REPOSITORY = Symbol('IOtpRepository');

export interface CrearTokenVerificacionData {
  idCliente?: string | null;
  numeroTelefono?: string | null;
  email?: string | null;
  token: string;
  proposito: PropositoOtp;
  expiraEn: Date;
}

export interface BuscarTokenValidoParams {
  numeroTelefono?: string;
  email?: string;
  proposito: PropositoOtp;
  token: string;
}

/** HU_08/HU_09: respaldo de identity.token_verificacion (OTP de un solo uso). */
export interface IOtpRepository {
  crear(data: CrearTokenVerificacionData): Promise<TokenVerificacion>;
  buscarValido(params: BuscarTokenValidoParams): Promise<TokenVerificacion | null>;
  marcarUsado(id: string): Promise<void>;
}
