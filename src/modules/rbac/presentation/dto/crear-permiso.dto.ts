import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CrearPermisoDto {
  @IsString()
  @IsNotEmpty()
  moduloId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  codigo!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  nombre!: string;
}
