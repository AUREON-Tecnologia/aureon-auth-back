import { AuthSessionResult } from '../../application/commands/auth-command.service';
import { permisosDeRol } from '../../domain/permisos-catalogo';
import { LoginResponseDto } from '../dto/login-response.dto';
import { UsuarioAutenticadoDto } from '../dto/usuario-autenticado.dto';

export function toLoginResponseDto(resultado: AuthSessionResult): LoginResponseDto {
  const dto = new LoginResponseDto();
  dto.token = resultado.accessToken;
  dto.tipoToken = 'Bearer';
  dto.expiraEn = resultado.accessTokenExpiraEn.toISOString();
  dto.refreshToken = resultado.refreshToken;
  dto.refreshExpiraEn = resultado.refreshExpiraEn.toISOString();
  dto.usuario = UsuarioAutenticadoDto.desde(resultado.usuario, resultado.rol);
  dto.permisos = permisosDeRol(resultado.rol);
  return dto;
}
