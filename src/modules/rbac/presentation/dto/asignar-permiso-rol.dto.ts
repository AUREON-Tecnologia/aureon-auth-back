import { IsNotEmpty, IsString } from 'class-validator';

export class AsignarPermisoRolDto {
  @IsString()
  @IsNotEmpty()
  permisoId!: string;
}
