import { Inject, Injectable } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_CLIENT } from '../../../../common/supabase/supabase-client.provider';
import { Paginacion } from '../../../../common/domain/paginacion-meta';
import {
  CreateUsuarioData,
  FiltrosUsuario,
  IAuthRepository,
  UpdateUsuarioData,
  UsuarioWithPassword,
} from '../../domain/repositories/auth.repository.interface';
import { Usuario } from '../../domain/entities/usuario.entity';
import { UsuarioRol } from '../../domain/entities/usuario-rol.entity';

/** Columnas reales de identity.usuario, ver docus/scripts-v2/aureon_ddl_01_identity.sql */
interface UsuarioRow {
  id: string;
  numero_identificacion: string;
  id_tipo_numero_identificacion: string;
  password_hash: string;
  email: string;
  telefono: string;
  id_usuario_rol: string;
  activo: boolean;
  intentos_fallidos: number;
  bloqueado_hasta: string | null;
  ultimo_acceso: string | null;
  created_at: string;
  usuario_rol?: UsuarioRolRow | UsuarioRolRow[] | null;
}

interface UsuarioRolRow {
  id: string;
  nombre: string;
  nivel_permisos: number;
}

@Injectable()
export class SupabaseAuthRepository implements IAuthRepository {
  constructor(@Inject(SUPABASE_CLIENT) private readonly client: SupabaseClient) {}

  async findById(id: string): Promise<Usuario | null> {
    const { data, error } = await this.client
      .from('usuario')
      .select('*, usuario_rol:usuario_rol(*)')
      .eq('id', id)
      .maybeSingle<UsuarioRow>();

    if (error) {
      throw new Error(`Error consultando usuario por id: ${error.message}`);
    }
    return data ? this.toEntity(data) : null;
  }

  async findByEmail(email: string): Promise<Usuario | null> {
    const { data, error } = await this.client
      .from('usuario')
      .select('*, usuario_rol:usuario_rol(*)')
      .eq('email', email)
      .maybeSingle<UsuarioRow>();

    if (error) {
      throw new Error(`Error consultando usuario por email: ${error.message}`);
    }
    return data ? this.toEntity(data) : null;
  }

  async findByEmailWithPassword(email: string): Promise<UsuarioWithPassword | null> {
    const { data, error } = await this.client
      .from('usuario')
      .select('*, usuario_rol:usuario_rol(*)')
      .eq('email', email)
      .maybeSingle<UsuarioRow>();

    if (error) {
      throw new Error(`Error consultando usuario con password: ${error.message}`);
    }
    if (!data) return null;
    return this.toEntityWithPassword(data);
  }

  async findByNumeroIdentificacion(numeroIdentificacion: string): Promise<Usuario | null> {
    const { data, error } = await this.client
      .from('usuario')
      .select('*, usuario_rol:usuario_rol(*)')
      .eq('numero_identificacion', numeroIdentificacion)
      .maybeSingle<UsuarioRow>();

    if (error) {
      throw new Error(`Error consultando usuario por numero_identificacion: ${error.message}`);
    }
    return data ? this.toEntity(data) : null;
  }

  async findAll(
    filtros: FiltrosUsuario,
    paginacion: Paginacion,
  ): Promise<{ data: Usuario[]; total: number }> {
    let query = this.client
      .from('usuario')
      .select('*, usuario_rol:usuario_rol(*)', { count: 'exact' });

    if (filtros.email) {
      query = query.ilike('email', `%${filtros.email}%`);
    }
    if (filtros.activo !== undefined) {
      query = query.eq('activo', filtros.activo);
    }
    if (filtros.idUsuarioRol) {
      query = query.eq('id_usuario_rol', filtros.idUsuarioRol);
    }

    const desde = (paginacion.pagina - 1) * paginacion.tamanioPagina;
    const hasta = desde + paginacion.tamanioPagina - 1;

    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(desde, hasta)
      .returns<UsuarioRow[]>();

    if (error) {
      throw new Error(`Error listando usuarios: ${error.message}`);
    }
    return { data: (data ?? []).map((row) => this.toEntity(row)), total: count ?? 0 };
  }

  async create(input: CreateUsuarioData): Promise<Usuario> {
    const { data, error } = await this.client
      .from('usuario')
      .insert({
        numero_identificacion: input.numeroIdentificacion,
        id_tipo_numero_identificacion: input.idTipoNumeroIdentificacion,
        password_hash: input.passwordHash,
        email: input.email,
        telefono: input.telefono,
        id_usuario_rol: input.idUsuarioRol,
      })
      .select('*, usuario_rol:usuario_rol(*)')
      .single<UsuarioRow>();

    if (error) {
      throw new Error(`Error creando usuario: ${error.message}`);
    }
    if (!data) {
      throw new Error('No se retorno el usuario creado');
    }
    return this.toEntity(data);
  }

  async update(id: string, data: UpdateUsuarioData): Promise<Usuario> {
    const patch: Record<string, unknown> = {};
    if (data.telefono !== undefined) patch.telefono = data.telefono;
    if (data.idUsuarioRol !== undefined) patch.id_usuario_rol = data.idUsuarioRol;
    if (data.activo !== undefined) patch.activo = data.activo;

    const { data: row, error } = await this.client
      .from('usuario')
      .update(patch)
      .eq('id', id)
      .select('*, usuario_rol:usuario_rol(*)')
      .single<UsuarioRow>();

    if (error) {
      throw new Error(`Error actualizando usuario: ${error.message}`);
    }
    if (!row) {
      throw new Error('No se retorno el usuario actualizado');
    }
    return this.toEntity(row);
  }

  async registrarLoginExitoso(id: string): Promise<void> {
    const { error } = await this.client
      .from('usuario')
      .update({ intentos_fallidos: 0, bloqueado_hasta: null, ultimo_acceso: new Date().toISOString() })
      .eq('id', id);

    if (error) {
      throw new Error(`Error registrando login exitoso: ${error.message}`);
    }
  }

  async registrarIntentoFallido(
    id: string,
    intentosFallidos: number,
    bloqueadoHasta: Date | null,
  ): Promise<void> {
    const { error } = await this.client
      .from('usuario')
      .update({
        intentos_fallidos: intentosFallidos,
        bloqueado_hasta: bloqueadoHasta ? bloqueadoHasta.toISOString() : null,
      })
      .eq('id', id);

    if (error) {
      throw new Error(`Error registrando intento fallido: ${error.message}`);
    }
  }

  private extractRol(rol: UsuarioRow['usuario_rol']): UsuarioRol | undefined {
    if (!rol) return undefined;
    const r = Array.isArray(rol) ? rol[0] : rol;
    if (!r) return undefined;
    return new UsuarioRol(r.id, r.nombre, r.nivel_permisos);
  }

  private toEntity(row: UsuarioRow): Usuario {
    return new Usuario(
      row.id,
      row.numero_identificacion,
      row.id_tipo_numero_identificacion,
      row.email,
      row.telefono,
      row.id_usuario_rol,
      row.activo,
      row.intentos_fallidos,
      row.bloqueado_hasta ? new Date(row.bloqueado_hasta) : null,
      row.ultimo_acceso ? new Date(row.ultimo_acceso) : null,
      new Date(row.created_at),
      this.extractRol(row.usuario_rol),
    );
  }

  private toEntityWithPassword(row: UsuarioRow): UsuarioWithPassword {
    const base = this.toEntity(row);
    return Object.assign(Object.create(base), base, { passwordHash: row.password_hash });
  }
}
