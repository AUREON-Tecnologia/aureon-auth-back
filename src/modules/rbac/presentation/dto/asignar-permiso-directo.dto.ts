import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class AsignarPermisoDirectoDto {
  @IsString()
  @IsNotEmpty()
  permisoId!: string;

  @IsIn(['ALLOW', 'DENY'])
  effect!: 'ALLOW' | 'DENY';

  @IsOptional()
  @IsString()
  razon?: string;
}
