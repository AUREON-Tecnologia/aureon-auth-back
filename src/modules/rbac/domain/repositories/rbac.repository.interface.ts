import { Paginacion } from '../../../../common/domain/paginacion-meta';
import { Membresia } from '../entities/membresia.entity';
import { Permiso } from '../entities/permiso.entity';
import { Modulo } from '../entities/modulo.entity';
import { TenantModulo } from '../entities/tenant-modulo.entity';
import { Rol } from '../entities/rol.entity';

export const RBAC_REPOSITORY = Symbol('IRbacRepository');

export interface CrearModuloData {
  codigo: string;
  nombre: string;
  descripcion?: string | null;
}

export interface CrearPermisoData {
  moduloId: string;
  codigo: string;
  nombre: string;
}

export interface CrearRolData {
  tenantId: string;
  codigo: string;
  nombre: string;
  descripcion?: string | null;
  esSistema?: boolean;
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
  tenantId: string;
  permisoId: string;
  effect: 'ALLOW' | 'DENY';
  otorgadoPor?: string | null;
  expiraEn?: Date | null;
  razon?: string | null;
}

export interface FiltrosMembresia {
  activo?: boolean;
}

/**
 * HU_13 (BD real): modulos/permisos son un catalogo GLOBAL (compartido por todos
 * los tenants); cada tenant activa los modulos que licencia via tenant_modules.
 * BD exige (via trigger) que el tenant tenga el modulo activo antes de poder
 * asignar uno de sus permisos a un rol o a un usuario.
 */
export interface IRbacRepository {
  // modulos (catalogo global)
  crearModulo(data: CrearModuloData): Promise<Modulo>;
  buscarModuloPorCodigo(codigo: string): Promise<Modulo | null>;
  listarModulos(): Promise<Modulo[]>;

  // tenant_modules (activacion por tenant)
  activarModuloParaTenant(tenantId: string, moduloId: string): Promise<TenantModulo>;
  desactivarModuloParaTenant(tenantId: string, moduloId: string): Promise<void>;
  listarModulosDeTenant(tenantId: string): Promise<TenantModulo[]>;

  // permisos (catalogo global, agrupado por modulo)
  crearPermiso(data: CrearPermisoData): Promise<Permiso>;
  buscarPermisoPorCodigo(codigo: string): Promise<Permiso | null>;
  listarPermisos(): Promise<Permiso[]>;
  asignarPermisoARol(rolId: string, permisoId: string, otorgadoPor?: string | null): Promise<void>;

  // roles (por tenant)
  crearRol(data: CrearRolData): Promise<Rol>;
  buscarRolPorCodigo(tenantId: string, codigo: string): Promise<Rol | null>;
  listarRoles(tenantId: string): Promise<Rol[]>;

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

  // permisos directos por usuario (ALLOW/DENY), ahora scoped por tenant
  asignarPermisoDirecto(data: AsignarPermisoDirectoData): Promise<void>;
  quitarPermisoDirecto(userId: string, tenantId: string, permisoId: string): Promise<void>;

  // permisos efectivos (vista v_user_effective_permissions)
  permisosEfectivos(userId: string, tenantId: string): Promise<string[]>;
  tienePermisoEfectivo(userId: string, tenantId: string, codigoPermiso: string): Promise<boolean>;
}
