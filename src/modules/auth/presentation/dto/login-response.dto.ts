import { AuthenticatedUserDto } from './authenticated-user.dto';

export class TenantSummaryDto {
  id!: string;
  code!: string;
  name!: string;
}

/** Forma de salida definida por auth.yaml#LoginResponse (login/register/refresh). */
export class LoginResponseDto {
  token!: string;
  tokenType!: string;
  expiresAt!: string;
  refreshToken!: string;
  refreshExpiresAt!: string;
  user!: AuthenticatedUserDto;
  permissions!: string[];
  activeModules!: string[];
  tenants!: TenantSummaryDto[];
}
