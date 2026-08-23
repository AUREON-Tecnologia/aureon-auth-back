import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * selectionToken es opcional en el body: modo 1 (justo despues de login, sin
 * sesion) lo necesita -- por cookie tenant_selection_token o aca -- modo 2
 * (ya autenticado, cambiando de tenant) lo ignora. Ver AuthCommandService.
 * switchTenant() y POST /auth/switch-tenant en auth.yaml.
 */
export class SwitchTenantDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  tenantCode!: string;

  @IsOptional()
  @IsString()
  selectionToken?: string;
}
