import { AuthenticatedUserDto } from './authenticated-user.dto';

/** Forma de salida definida por auth.yaml#LoginResponse (login/register/refresh). */
export class LoginResponseDto {
  token!: string;
  tokenType!: string;
  expiresAt!: string;
  refreshToken!: string;
  refreshExpiresAt!: string;
  user!: AuthenticatedUserDto;
  permissions!: string[];
}
