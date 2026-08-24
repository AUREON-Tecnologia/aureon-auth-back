import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '@aureon/redis-client';
import { CurrentUser, JwtPayload, SkipCsrf } from '@aureon/redis-client';
import { UserTokenService } from '../../application/services/user-token.service';
import { VerificarEmailDto } from '../dto/verificar-email.dto';

@Controller('auth')
export class SelfServiceController {
  constructor(private readonly userTokenService: UserTokenService) {}

  /**
   * Publico: el token del enlace de verificacion es la credencial.
   * @SkipCsrf() (mismo hallazgo 2026-08-23 que login/register/password-reset): no depende de la
   * cookie de sesion, una csrf_token vieja de otra sesion no debe poder bloquearla.
   */
  @Post('email/verificar')
  @SkipCsrf()
  @HttpCode(HttpStatus.OK)
  verificarEmail(@Body() dto: VerificarEmailDto): Promise<{ verificado: boolean }> {
    return this.userTokenService.verificarEmail(dto.token);
  }

  // Deuda tecnica aceptada, decision 2026-08-23 (ver CLAUDE.md, "CSRF deshabilitado en endpoints
  // de sesion real") -- a diferencia de email/verificar arriba, esta SI usa JwtAuthGuard (sesion
  // real). Quitar @SkipCsrf() es el unico cambio necesario si se revierte la decision.
  @Post('email/reenviar-verificacion')
  @UseGuards(JwtAuthGuard)
  @SkipCsrf()
  @HttpCode(HttpStatus.OK)
  async reenviarVerificacion(@CurrentUser() user: JwtPayload): Promise<{ mensaje: string }> {
    await this.userTokenService.solicitarVerificacionEmail(user.sub);
    return { mensaje: 'Si tu cuenta existe, se envio un correo de verificacion.' };
  }

  // Deuda tecnica aceptada, decision 2026-08-23 (ver CLAUDE.md, "CSRF deshabilitado en endpoints
  // de sesion real") -- usa JwtAuthGuard (sesion real). Quitar @SkipCsrf() es el unico cambio
  // necesario si se revierte la decision.
  @Post('mfa/iniciar-configuracion')
  @UseGuards(JwtAuthGuard)
  @SkipCsrf()
  @HttpCode(HttpStatus.OK)
  async iniciarMfa(@CurrentUser() user: JwtPayload): Promise<{ expiraEn: string }> {
    const { expiraEn } = await this.userTokenService.iniciarConfiguracionMfa(user.sub);
    return { expiraEn: expiraEn.toISOString() };
  }
}
