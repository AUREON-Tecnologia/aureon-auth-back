import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

/** Solo email+password: el tenant se resuelve por las membresias activas del usuario, ver AuthCommandService.login(). */
export class LoginDto {
  @IsEmail()
  @MaxLength(255)
  email!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(128)
  password!: string;
}
