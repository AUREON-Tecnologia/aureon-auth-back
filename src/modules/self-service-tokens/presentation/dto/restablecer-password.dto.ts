import { IsNotEmpty, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { MENSAJE_PASSWORD_COMPLEJA, REGEX_PASSWORD_COMPLEJA } from '../../../../common/validators/password-policy';

export class RestablecerPasswordDto {
  @IsString()
  @IsNotEmpty()
  token!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  @Matches(REGEX_PASSWORD_COMPLEJA, { message: MENSAJE_PASSWORD_COMPLEJA })
  nuevaPassword!: string;
}
