import { AuthSessionResult } from '../../application/commands/auth-command.service';
import { LoginResponseDto } from '../dto/login-response.dto';
import { AuthenticatedUserDto } from '../dto/authenticated-user.dto';

export function toLoginResponseDto(resultado: AuthSessionResult): LoginResponseDto {
  const dto = new LoginResponseDto();
  dto.token = resultado.accessToken;
  dto.tokenType = 'Bearer';
  dto.expiresAt = resultado.accessTokenExpiraEn.toISOString();
  dto.refreshToken = resultado.refreshToken;
  dto.refreshExpiresAt = resultado.refreshExpiraEn.toISOString();
  dto.user = AuthenticatedUserDto.desde(resultado.usuario, resultado.tenantId, resultado.rolCodigo);
  dto.permissions = resultado.permisos;
  return dto;
}
