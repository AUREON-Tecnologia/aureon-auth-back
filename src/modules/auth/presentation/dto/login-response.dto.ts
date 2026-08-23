import { AuthenticatedUserDto } from './authenticated-user.dto';
import { PermissionsByModule } from '../../../../common/utils/group-permissions.util';

export class TenantSummaryDto {
  id!: string;
  code!: string;
  name!: string;
}

/** Forma de salida definida por auth.yaml#LoginResponse (register/switchTenant/refresh). */
export class LoginResponseDto {
  token!: string;
  tokenType!: string;
  expiresAt!: string;
  refreshToken!: string;
  refreshExpiresAt!: string;
  user!: AuthenticatedUserDto;
  /** Agrupado por modulo/recurso (decision 2026-08-22) -- distinto del array plano que lleva el JWT internamente. */
  permissions!: PermissionsByModule;
  activeModules!: string[];
  tenants!: TenantSummaryDto[];
}

/**
 * Forma de salida definida por auth.yaml#LoginTenantsResponse — decision
 * 2026-08-22. POST /auth/login SIEMPRE responde esto (nunca LoginResponseDto):
 * no abre sesion, solo valida credenciales y da la lista de tenants +
 * selectionToken para completar la apertura de sesion en POST /auth/switch-tenant.
 */
export class LoginTenantsResponseDto {
  tenants!: TenantSummaryDto[];
  selectionToken!: string;
}
