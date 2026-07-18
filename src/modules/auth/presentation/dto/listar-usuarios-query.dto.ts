import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsEmail, IsInt, IsOptional, Max, Min } from 'class-validator';

export class ListarUsuariosQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pagina?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  tamanioPagina?: number;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  activo?: boolean;
}
