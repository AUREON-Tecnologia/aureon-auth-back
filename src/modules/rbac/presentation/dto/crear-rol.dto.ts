import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CrearRolDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  codigo!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  nombre!: string;

  @IsOptional()
  @IsString()
  descripcion?: string;
}
