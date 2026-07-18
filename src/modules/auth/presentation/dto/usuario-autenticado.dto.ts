import { RolNegocio } from '../../../../common/domain/rol-negocio';
import { Usuario } from '../../domain/entities/usuario.entity';

/**
 * Forma de salida definida por auth.yaml#UsuarioAutenticado. `nombre` (persona) y
 * `clienteId`/`tecnicoId` no existen todavia en identity.usuario (ver HU_11 y
 * CLAUDE.md) — se omiten/null hasta que exista esa relacion en el modelo de datos.
 */
export class UsuarioAutenticadoDto {
  id!: string;
  correo!: string;
  nombre?: string;
  rol!: RolNegocio;
  clienteId!: string | null;
  tecnicoId!: string | null;
  activo!: boolean;

  static desde(usuario: Usuario, rol: RolNegocio): UsuarioAutenticadoDto {
    const dto = new UsuarioAutenticadoDto();
    dto.id = usuario.id;
    dto.correo = usuario.email;
    dto.rol = rol;
    dto.clienteId = null;
    dto.tecnicoId = null;
    dto.activo = usuario.activo;
    return dto;
  }
}
