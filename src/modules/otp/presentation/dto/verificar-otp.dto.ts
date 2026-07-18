import { IsEmail, IsIn, IsString, Length, ValidateIf } from 'class-validator';
import { PROPOSITOS_OTP, PropositoOtp } from '../../domain/entities/token-verificacion.entity';

export class VerificarOtpDto {
  @ValidateIf((o: VerificarOtpDto) => !o.email)
  @IsString()
  numeroTelefono?: string;

  @ValidateIf((o: VerificarOtpDto) => !o.numeroTelefono)
  @IsEmail()
  email?: string;

  @IsIn(PROPOSITOS_OTP)
  proposito!: PropositoOtp;

  @IsString()
  @Length(8, 8)
  codigo!: string;
}
