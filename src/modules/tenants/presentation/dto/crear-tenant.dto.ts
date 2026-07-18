import { IsEmail, IsNotEmpty, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { MENSAJE_PASSWORD_COMPLEJA, REGEX_PASSWORD_COMPLEJA } from '../../../../common/validators/password-policy';

const REGEX_CODIGO_SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export class CrearTenantDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @Matches(REGEX_CODIGO_SLUG, { message: 'codigoTenant debe ser un slug en minusculas (ej. acme-corp)' })
  codigoTenant!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  nombreTenant!: string;

  @IsEmail()
  @MaxLength(255)
  emailAdmin!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  @Matches(REGEX_PASSWORD_COMPLEJA, { message: MENSAJE_PASSWORD_COMPLEJA })
  passwordAdmin!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  primerNombreAdmin?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  apellidoAdmin?: string;
}
