import { IsEmail, IsNotEmpty, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { MENSAJE_PASSWORD_COMPLEJA, REGEX_PASSWORD_COMPLEJA } from '../../../../common/validators/password-policy';

export class RegisterDto {
  @IsEmail()
  @MaxLength(255)
  email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  @Matches(REGEX_PASSWORD_COMPLEJA, { message: MENSAJE_PASSWORD_COMPLEJA })
  password!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  tenantCode!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  primerNombre?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  apellido?: string;
}
