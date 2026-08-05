import { Usuario } from '../../domain/entities/usuario.entity';

/**
 * HU_13: a diferencia del modelo anterior, `role` ya no es un enum cerrado (un tenant
 * puede crear roles propios via el modulo rbac) — se emite el `code` real de la
 * membresia. `name` ahora si existe en el modelo de datos (first_name/last_name).
 * No hay equivalente a clienteId/tecnicoId en este esquema generico multi-tenant.
 *
 * Forma de salida definida por auth.yaml#AuthenticatedUser (campos en ingles,
 * ver la nota en auth.yaml#info.description sobre el resto del servicio).
 */
export class AuthenticatedUserDto {
  id!: string;
  email!: string;
  name?: string;
  role!: string;
  tenantId!: string;
  active!: boolean;

  static desde(usuario: Usuario, tenantId: string, rolCodigo: string): AuthenticatedUserDto {
    const dto = new AuthenticatedUserDto();
    dto.id = usuario.id;
    dto.email = usuario.email;
    const nombreCompleto = [usuario.primerNombre, usuario.apellido].filter(Boolean).join(' ').trim();
    dto.name = nombreCompleto.length > 0 ? nombreCompleto : undefined;
    dto.role = rolCodigo;
    dto.tenantId = tenantId;
    dto.active = usuario.puedeAutenticar;
    return dto;
  }
}
