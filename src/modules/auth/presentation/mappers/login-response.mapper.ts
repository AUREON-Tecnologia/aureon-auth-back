import { AuthSessionResult } from '../../application/commands/auth-command.service';
import { LoginResponseDto } from '../dto/login-response.dto';
import { AuthenticatedUserDto } from '../dto/authenticated-user.dto';

export function toLoginResponseDto(result: AuthSessionResult): LoginResponseDto {
  const dto = new LoginResponseDto();
  dto.token = result.accessToken;
  dto.tokenType = 'Bearer';
  dto.expiresAt = result.accessTokenExpiresAt.toISOString();
  dto.refreshToken = result.refreshToken;
  dto.refreshExpiresAt = result.refreshExpiresAt.toISOString();
  dto.user = AuthenticatedUserDto.desde(result.user, result.tenantId, result.roleCode);
  dto.permissions = result.permissions;
  dto.activeModules = result.activeModules;
  dto.tenants = result.tenants;
  return dto;
}
