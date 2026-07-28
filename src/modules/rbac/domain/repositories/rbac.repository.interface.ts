import { Paginacion } from '../../../../common/domain/paginacion-meta';
import { Membresia } from '../entities/membresia.entity';
import { Permiso } from '../entities/permiso.entity';
import { Rol } from '../entities/rol.entity';

export const RBAC_REPOSITORY = Symbol('IRbacRepository');

export interface CrearRolData {
  tenantId: string;
  codigo: string;
  nombre: string;
  descripcion?: string | null;
  esSistema?: boolean;
}

export interface CrearPermisoData {
  tenantId: string;
  codigo: string;
  nombre: string;
  recurso: string;
  accion: string;
}

export interface CrearMembresiaData {
  userId: string;
  tenantId: string;
  rolId: string;
  invitadoPor?: string | null;
}

export interface ActualizarMembresiaData {
  rolId?: string;
  activo?: boolean;
}

export interface AsignarPermisoDirectoData {
  userId: string;
  permisoId: string;
  effect: 'ALLOW' | 'DENY';
  otorgadoPor?: string | null;
  expiraEn?: Date | null;
  razon?: string | null;
}

export interface FiltrosMembresia {
  activo?: boolean;
}

/** HU_13: respaldo de roles/permissions/role_permissions/user_tenant_memberships/user_permissions + v_user_effective_permissions. */
export interface IRbacRepository {
  // roles
  crearRol(data: CrearRolData): Promise<Rol>;
  buscarRolPorCodigo(tenantId: string, codigo: string): Promise<Rol | null>;
  listarRoles(tenantId: string): Promise<Rol[]>;

  // permissions
  crearPermiso(data: CrearPermisoData): Promise<Permiso>;
  listarPermisos(tenantId: string): Promise<Permiso[]>;
  asignarPermisoARol(rolId: string, permisoId: string, otorgadoPor?: string | null): Promise<void>;

  // memberships (user_tenant_memberships)
  crearMembresia(data: CrearMembresiaData): Promise<Membresia>;
  buscarMembresia(userId: string, tenantId: string): Promise<Membresia | null>;
  buscarMembresiaPorId(id: string, tenantId: string): Promise<Membresia | null>;
  listarMembresias(
    tenantId: string,
    filtros: FiltrosMembresia,
    paginacion: Paginacion,
  ): Promise<{ data: Membresia[]; total: number }>;
  actualizarMembresia(id: string, data: ActualizarMembresiaData): Promise<Membresia>;

  // permisos directos por usuario (ALLOW/DENY)
  asignarPermisoDirecto(data: AsignarPermisoDirectoData): Promise<void>;
  quitarPermisoDirecto(userId: string, permisoId: string): Promise<void>;

  // permisos efectivos (v_user_effective_permissions)
  permisosEfectivos(userId: string, tenantId: string): Promise<string[]>;
  tienePermisoEfectivo(userId: string, tenantId: string, codigoPermiso: string): Promise<boolean>;
}
