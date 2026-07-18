import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../../common/guards/roles.guard';
import { Roles } from '../../../../common/decorators/roles.decorator';
import { OtpService } from '../../application/services/otp.service';
import { EmitirOtpDto } from '../dto/emitir-otp.dto';
import { VerificarOtpDto } from '../dto/verificar-otp.dto';

/**
 * HU_08/HU_09. `x-roles: [sistema]`: quien dispara esto es el backend del
 * asistente virtual (u otro servicio interno) autenticado como rol `sistema`,
 * no el cliente final directamente (ver docus/desarrollo-ia/auth/hus/HU_08.md).
 */
@Controller('auth/otp')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('sistema')
export class OtpController {
  constructor(private readonly otpService: OtpService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async emitir(@Body() dto: EmitirOtpDto): Promise<{ expiraEn: string }> {
    const { expiraEn } = await this.otpService.emitir(dto);
    return { expiraEn: expiraEn.toISOString() };
  }

  @Post('verificar')
  @HttpCode(HttpStatus.OK)
  verificar(@Body() dto: VerificarOtpDto): Promise<{ valido: boolean }> {
    return this.otpService.verificar(dto);
  }
}
