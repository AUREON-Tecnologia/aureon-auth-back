import {
  IsEmail,
  IsNotEmpty,
  IsString,
  MinLength,
  MaxLength,
  Matches,
} from 'class-validator';

export class RegisterDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  numeroIdentificacion!: string;

  @IsString()
  @IsNotEmpty()
  idTipoNumeroIdentificacion!: string;

  @IsEmail()
  @MaxLength(255)
  email!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  @Matches(/^[+]?[0-9\s-]{7,20}$/, { message: 'telefono invalido' })
  telefono!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;

  @IsString()
  @IsNotEmpty()
  idUsuarioRol!: string;
}