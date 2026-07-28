import { UsuarioAutenticadoDto } from './usuario-autenticado.dto';

/** Forma de salida definida por auth.yaml#LoginResponse (login/register/refresh). */
export class LoginResponseDto {
  token!: string;
  tipoToken!: string;
  expiraEn!: string;
  refreshToken!: string;
  refreshExpiraEn!: string;
  usuario!: UsuarioAutenticadoDto;
  permisos!: string[];
}
