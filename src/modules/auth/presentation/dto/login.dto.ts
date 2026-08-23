import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Solo email+password: login (decision 2026-08-22) nunca abre sesion por si
 * mismo, solo valida credenciales y devuelve tenants+selectionToken. Ver
 * AuthCommandService.login() y POST /auth/switch-tenant para el resto del
 * flujo.
 */
export class LoginDto {
  @IsEmail()
  @MaxLength(255)
  email!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(128)
  password!: string;
}
