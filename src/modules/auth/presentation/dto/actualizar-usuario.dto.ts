import { IsBoolean, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

/** numeroIdentificacion, idTipoNumeroIdentificacion y email son inmutables (no se declaran aqui). */
export class ActualizarUsuarioDto {
  @IsOptional()
  @IsString()
  @MaxLength(30)
  @Matches(/^[+]?[0-9\s-]{7,20}$/, { message: 'telefono invalido' })
  telefono?: string;

  @IsOptional()
  @IsString()
  idUsuarioRol?: string;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}
