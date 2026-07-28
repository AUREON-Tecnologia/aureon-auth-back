import { IsEmail, MaxLength } from 'class-validator';

export class SolicitarResetPasswordDto {
  @IsEmail()
  @MaxLength(255)
  email!: string;
}
