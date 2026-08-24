import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { SkipCsrf } from '@aureon/redis-client';
import { UserTokenService } from '../../application/services/user-token.service';
import { SolicitarResetPasswordDto } from '../dto/solicitar-reset-password.dto';
import { RestablecerPasswordDto } from '../dto/restablecer-password.dto';

/**
 * Publico (sin JWT) — el token del correo es la credencial, igual que refresh/logout.
 * @SkipCsrf() a nivel de clase (mismo hallazgo 2026-08-23 que login/register): ninguna de estas
 * dos rutas depende de la cookie de sesion, asi que una csrf_token vieja de otra sesion no debe
 * poder bloquearlas.
 */
@Controller('auth/password')
@SkipCsrf()
export class PasswordResetController {
  constructor(private readonly userTokenService: UserTokenService) {}

  @Post('olvide')
  @HttpCode(HttpStatus.OK)
  async solicitar(@Body() dto: SolicitarResetPasswordDto): Promise<{ mensaje: string }> {
    await this.userTokenService.solicitarResetPassword(dto.email);
    return { mensaje: 'Si el correo existe, se enviaran instrucciones para restablecer la contrasena.' };
  }

  @Post('restablecer')
  @HttpCode(HttpStatus.OK)
  restablecer(@Body() dto: RestablecerPasswordDto): Promise<{ restablecida: boolean }> {
    return this.userTokenService.restablecerPassword(dto.token, dto.nuevaPassword);
  }
}
