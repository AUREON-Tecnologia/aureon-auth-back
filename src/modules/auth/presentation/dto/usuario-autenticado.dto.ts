import { Usuario } from '../../domain/entities/usuario.entity';

/**
 * HU_13: a diferencia del modelo anterior, `rol` ya no es un enum cerrado (un tenant
 * puede crear roles propios via el modulo rbac) — se emite el `code` real de la
 * membresia. `nombre` ahora si existe en el modelo de datos (first_name/last_name).
 * No hay equivalente a clienteId/tecnicoId en este esquema generico multi-tenant.
 */
export class UsuarioAutenticadoDto {
  id!: string;
  correo!: string;
  nombre?: string;
  rol!: string;
  tenantId!: string;
  activo!: boolean;

  static desde(usuario: Usuario, tenantId: string, rolCodigo: string): UsuarioAutenticadoDto {
    const dto = new UsuarioAutenticadoDto();
    dto.id = usuario.id;
    dto.correo = usuario.email;
    const nombreCompleto = [usuario.primerNombre, usuario.apellido].filter(Boolean).join(' ').trim();
    dto.nombre = nombreCompleto.length > 0 ? nombreCompleto : undefined;
    dto.rol = rolCodigo;
    dto.tenantId = tenantId;
    dto.activo = usuario.puedeAutenticar;
    return dto;
  }
}
