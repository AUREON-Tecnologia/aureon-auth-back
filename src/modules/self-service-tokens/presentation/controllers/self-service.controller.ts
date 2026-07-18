import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../../../common/guards/jwt-auth.guard';
import { CurrentUser, JwtPayload } from '../../../../common/decorators/current-user.decorator';
import { UserTokenService } from '../../application/services/user-token.service';
import { VerificarEmailDto } from '../dto/verificar-email.dto';

@Controller('auth')
export class SelfServiceController {
  constructor(private readonly userTokenService: UserTokenService) {}

  /** Publico: el token del enlace de verificacion es la credencial. */
  @Post('email/verificar')
  @HttpCode(HttpStatus.OK)
  verificarEmail(@Body() dto: VerificarEmailDto): Promise<{ verificado: boolean }> {
    return this.userTokenService.verificarEmail(dto.token);
  }

  @Post('email/reenviar-verificacion')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async reenviarVerificacion(@CurrentUser() user: JwtPayload): Promise<{ mensaje: string }> {
    await this.userTokenService.solicitarVerificacionEmail(user.sub);
    return { mensaje: 'Si tu cuenta existe, se envio un correo de verificacion.' };
  }

  @Post('mfa/iniciar-configuracion')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async iniciarMfa(@CurrentUser() user: JwtPayload): Promise<{ expiraEn: string }> {
    const { expiraEn } = await this.userTokenService.iniciarConfiguracionMfa(user.sub);
    return { expiraEn: expiraEn.toISOString() };
  }
}
