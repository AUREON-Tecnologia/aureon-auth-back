import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class ActualizarMembresiaDto {
  @IsOptional()
  @IsString()
  rolId?: string;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}
