import { IsEmail, IsNotEmpty, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { PASSWORD_POLICY_MESSAGE_EN, REGEX_PASSWORD_COMPLEJA } from '../../../../common/validators/password-policy';

export class RegisterDto {
  @IsEmail()
  @MaxLength(255)
  email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  @Matches(REGEX_PASSWORD_COMPLEJA, { message: PASSWORD_POLICY_MESSAGE_EN })
  password!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  tenantCode!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  lastName?: string;
}
