import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CrearPermisoDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  codigo!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  nombre!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  recurso!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  accion!: string;
}
