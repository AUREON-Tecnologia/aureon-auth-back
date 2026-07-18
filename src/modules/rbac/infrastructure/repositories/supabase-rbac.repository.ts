import { Inject, Injectable } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_CLIENT } from '../../../../common/supabase/supabase-client.provider';
import { Paginacion } from '../../../../common/domain/paginacion-meta';
import {
  ActualizarMembresiaData,
  AsignarPermisoDirectoData,
  CrearMembresiaData,
  CrearPermisoData,
  CrearRolData,
  FiltrosMembresia,
  IRbacRepository,
} from '../../domain/repositories/rbac.repository.interface';
import { Rol } from '../../domain/entities/rol.entity';
import { Permiso } from '../../domain/entities/permiso.entity';
import { Membresia, UsuarioResumen } from '../../domain/entities/membresia.entity';

/** Columnas reales, ver docus/scripts-v3/scripts-auth.sql */
interface RolRow {
  id: string;
  tenant_id: string;
  code: string;
  name: string;
  description: string | null;
  is_active: boolean;
  is_system: boolean;
}

interface PermisoRow {
  id: string;
  tenant_id: string;
  code: string;
  name: string;
  resource: string;
  action: string;
  is_active: boolean;
}

interface UsuarioResumenRow {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
}

interface MembresiaRow {
  id: string;
  user_id: string;
  tenant_id: string;
  role_id: string;
  is_active: boolean;
  joined_at: string;
  expires_at: string | null;
  roles?: RolRow | RolRow[] | null;
  users?: UsuarioResumenRow | UsuarioResumenRow[] | null;
}

@Injectable()
export class SupabaseRbacRepository implements IRbacRepository {
  constructor(@Inject(SUPABASE_CLIENT) private readonly client: SupabaseClient) {}

  async crearRol(data: CrearRolData): Promise<Rol> {
    const { data: row, error } = await this.client
      .from('roles')
      .insert({
        tenant_id: data.tenantId,
        code: data.codigo,
        name: data.nombre,
        description: data.descripcion ?? null,
        is_system: data.esSistema ?? false,
      })
      .select('*')
      .single<RolRow>();

    if (error) throw new Error(`Error creando rol: ${error.message}`);
    if (!row) throw new Error('No se retorno el rol creado');
    return this.toRol(row);
  }

  async buscarRolPorCodigo(tenantId: string, codigo: string): Promise<Rol | null> {
    const { data, error } = await this.client
      .from('roles')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('code', codigo)
      .maybeSingle<RolRow>();

    if (error) throw new Error(`Error consultando rol: ${error.message}`);
    return data ? this.toRol(data) : null;
  }

  async listarRoles(tenantId: string): Promise<Rol[]> {
    const { data, error } = await this.client.from('roles').select('*').eq('tenant_id', tenantId);
    if (error) throw new Error(`Error listando roles: ${error.message}`);
    return (data ?? []).map((row) => this.toRol(row as RolRow));
  }

  async crearPermiso(data: CrearPermisoData): Promise<Permiso> {
    const { data: row, error } = await this.client
      .from('permissions')
      .insert({
        tenant_id: data.tenantId,
        code: data.codigo,
        name: data.nombre,
        resource: data.recurso,
        action: data.accion,
      })
      .select('*')
      .single<PermisoRow>();

    if (error) throw new Error(`Error creando permiso: ${error.message}`);
    if (!row) throw new Error('No se retorno el permiso creado');
    return this.toPermiso(row);
  }

  async listarPermisos(tenantId: string): Promise<Permiso[]> {
    const { data, error } = await this.client.from('permissions').select('*').eq('tenant_id', tenantId);
    if (error) throw new Error(`Error listando permisos: ${error.message}`);
    return (data ?? []).map((row) => this.toPermiso(row as PermisoRow));
  }

  async asignarPermisoARol(rolId: string, permisoId: string, otorgadoPor?: string | null): Promise<void> {
    const { error } = await this.client
      .from('role_permissions')
      .insert({ role_id: rolId, permission_id: permisoId, granted_by: otorgadoPor ?? null });
    if (error) throw new Error(`Error asignando permiso al rol: ${error.message}`);
  }

  async crearMembresia(data: CrearMembresiaData): Promise<Membresia> {
    const { data: row, error } = await this.client
      .from('user_tenant_memberships')
      .insert({
        user_id: data.userId,
        tenant_id: data.tenantId,
        role_id: data.rolId,
        invited_by: data.invitadoPor ?? null,
      })
      .select('*, roles:role_id(*), users:user_id(*)')
      .single<MembresiaRow>();

    if (error) throw new Error(`Error creando membresia: ${error.message}`);
    if (!row) throw new Error('No se retorno la membresia creada');
    return this.toMembresia(row);
  }

  async buscarMembresia(userId: string, tenantId: string): Promise<Membresia | null> {
    const { data, error } = await this.client
      .from('user_tenant_memberships')
      .select('*, roles:role_id(*), users:user_id(*)')
      .eq('user_id', userId)
      .eq('tenant_id', tenantId)
      .maybeSingle<MembresiaRow>();

    if (error) throw new Error(`Error consultando membresia: ${error.message}`);
    return data ? this.toMembresia(data) : null;
  }

  async buscarMembresiaPorId(id: string, tenantId: string): Promise<Membresia | null> {
    const { data, error } = await this.client
      .from('user_tenant_memberships')
      .select('*, roles:role_id(*), users:user_id(*)')
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .maybeSingle<MembresiaRow>();

    if (error) throw new Error(`Error consultando membresia por id: ${error.message}`);
    return data ? this.toMembresia(data) : null;
  }

  async listarMembresias(
    tenantId: string,
    filtros: FiltrosMembresia,
    paginacion: Paginacion,
  ): Promise<{ data: Membresia[]; total: number }> {
    let query = this.client
      .from('user_tenant_memberships')
      .select('*, roles:role_id(*), users:user_id(*)', { count: 'exact' })
      .eq('tenant_id', tenantId);

    if (filtros.activo !== undefined) {
      query = query.eq('is_active', filtros.activo);
    }

    const desde = (paginacion.pagina - 1) * paginacion.tamanioPagina;
    const hasta = desde + paginacion.tamanioPagina - 1;

    const { data, error, count } = await query
      .order('joined_at', { ascending: false })
      .range(desde, hasta)
      .returns<MembresiaRow[]>();

    if (error) throw new Error(`Error listando membresias: ${error.message}`);
    return { data: (data ?? []).map((row) => this.toMembresia(row)), total: count ?? 0 };
  }

  async actualizarMembresia(id: string, data: ActualizarMembresiaData): Promise<Membresia> {
    const patch: Record<string, unknown> = {};
    if (data.rolId !== undefined) patch.role_id = data.rolId;
    if (data.activo !== undefined) patch.is_active = data.activo;

    const { data: row, error } = await this.client
      .from('user_tenant_memberships')
      .update(patch)
      .eq('id', id)
      .select('*, roles:role_id(*), users:user_id(*)')
      .single<MembresiaRow>();

    if (error) throw new Error(`Error actualizando membresia: ${error.message}`);
    if (!row) throw new Error('No se retorno la membresia actualizada');
    return this.toMembresia(row);
  }

  async asignarPermisoDirecto(data: AsignarPermisoDirectoData): Promise<void> {
    const { error } = await this.client.from('user_permissions').upsert(
      {
        user_id: data.userId,
        permission_id: data.permisoId,
        effect: data.effect,
        granted_by: data.otorgadoPor ?? null,
        expires_at: data.expiraEn ? data.expiraEn.toISOString() : null,
        reason: data.razon ?? null,
      },
      { onConflict: 'user_id,permission_id' },
    );
    if (error) throw new Error(`Error asignando permiso directo: ${error.message}`);
  }

  async quitarPermisoDirecto(userId: string, permisoId: string): Promise<void> {
    const { error } = await this.client
      .from('user_permissions')
      .delete()
      .eq('user_id', userId)
      .eq('permission_id', permisoId);
    if (error) throw new Error(`Error quitando permiso directo: ${error.message}`);
  }

  async permisosEfectivos(userId: string, tenantId: string): Promise<string[]> {
    const { data: vista, error: errorVista } = await this.client
      .from('v_user_effective_permissions')
      .select('permission_id')
      .eq('user_id', userId)
      .eq('tenant_id', tenantId);

    if (errorVista) throw new Error(`Error consultando permisos efectivos: ${errorVista.message}`);

    const permisoIds = (vista ?? []).map((r: { permission_id: string }) => r.permission_id);
    if (permisoIds.length === 0) return [];

    const { data: permisos, error: errorPermisos } = await this.client
      .from('permissions')
      .select('code')
      .in('id', permisoIds);

    if (errorPermisos) throw new Error(`Error consultando codigos de permisos: ${errorPermisos.message}`);
    return (permisos ?? []).map((p: { code: string }) => p.code);
  }

  async tienePermisoEfectivo(userId: string, tenantId: string, codigoPermiso: string): Promise<boolean> {
    const permisos = await this.permisosEfectivos(userId, tenantId);
    return permisos.includes(codigoPermiso);
  }

  private toRol(row: RolRow): Rol {
    return new Rol(row.id, row.tenant_id, row.code, row.name, row.description, row.is_active, row.is_system);
  }

  private toPermiso(row: PermisoRow): Permiso {
    return new Permiso(row.id, row.tenant_id, row.code, row.name, row.resource, row.action, row.is_active);
  }

  private extractUno<T>(valor: T | T[] | null | undefined): T | undefined {
    if (!valor) return undefined;
    return Array.isArray(valor) ? valor[0] : valor;
  }

  private toMembresia(row: MembresiaRow): Membresia {
    const rolRow = this.extractUno(row.roles);
    const usuarioRow = this.extractUno(row.users);
    const usuario: UsuarioResumen | undefined = usuarioRow
      ? {
          id: usuarioRow.id,
          email: usuarioRow.email,
          primerNombre: usuarioRow.first_name,
          apellido: usuarioRow.last_name,
        }
      : undefined;

    return new Membresia(
      row.id,
      row.user_id,
      row.tenant_id,
      row.role_id,
      row.is_active,
      new Date(row.joined_at),
      row.expires_at ? new Date(row.expires_at) : null,
      rolRow ? this.toRol(rolRow) : undefined,
      usuario,
    );
  }
}
