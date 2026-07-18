import { IsEmail, IsIn, IsString, ValidateIf } from 'class-validator';
import { PROPOSITOS_OTP, PropositoOtp } from '../../domain/entities/token-verificacion.entity';

export class EmitirOtpDto {
  @ValidateIf((o: EmitirOtpDto) => !o.email)
  @IsString()
  numeroTelefono?: string;

  @ValidateIf((o: EmitirOtpDto) => !o.numeroTelefono)
  @IsEmail()
  email?: string;

  @IsIn(PROPOSITOS_OTP)
  proposito!: PropositoOtp;
}
