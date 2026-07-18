import {
  IsEmail,
  IsNotEmpty,
  IsString,
  MinLength,
  MaxLength,
  Matches,
} from 'class-validator';

const REGEX_PASSWORD_COMPLEJA =
  /^(?=.*[A-Za-z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]).+$/;

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
  @Matches(REGEX_PASSWORD_COMPLEJA, {
    message: 'La contrasena debe tener al menos una letra, un numero y un caracter especial',
  })
  password!: string;

  @IsString()
  @IsNotEmpty()
  idUsuarioRol!: string;
}
