import { Inject, Injectable } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_CLIENT } from '../../../../common/supabase/supabase-client.provider';
import {
  CreateUsuarioData,
  IAuthRepository,
  UpdateUsuarioData,
  UsuarioWithPassword,
} from '../../domain/repositories/auth.repository.interface';
import { Usuario } from '../../domain/entities/usuario.entity';

/** Columnas reales de `users`, ver docus/scripts-v3/scripts-auth.sql */
interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  email_verified_at: string | null;
  first_name: string | null;
  last_name: string | null;
  is_active: boolean;
  last_login_at: string | null;
  failed_login_attempts: number;
  locked_until: string | null;
  created_at: string;
  deleted_at: string | null;
}

@Injectable()
export class SupabaseAuthRepository implements IAuthRepository {
  constructor(@Inject(SUPABASE_CLIENT) private readonly client: SupabaseClient) {}

  async findById(id: string): Promise<Usuario | null> {
    const { data, error } = await this.client.from('users').select('*').eq('id', id).maybeSingle<UserRow>();
    if (error) throw new Error(`Error consultando usuario por id: ${error.message}`);
    return data ? this.toEntity(data) : null;
  }

  async findByEmail(email: string): Promise<Usuario | null> {
    const { data, error } = await this.client
      .from('users')
      .select('*')
      .eq('email', email)
      .maybeSingle<UserRow>();
    if (error) throw new Error(`Error consultando usuario por email: ${error.message}`);
    return data ? this.toEntity(data) : null;
  }

  async findByEmailWithPassword(email: string): Promise<UsuarioWithPassword | null> {
    const { data, error } = await this.client
      .from('users')
      .select('*')
      .eq('email', email)
      .maybeSingle<UserRow>();
    if (error) throw new Error(`Error consultando usuario con password: ${error.message}`);
    if (!data) return null;
    return this.toEntityWithPassword(data);
  }

  async create(input: CreateUsuarioData): Promise<Usuario> {
    const { data, error } = await this.client
      .from('users')
      .insert({
        email: input.email,
        password_hash: input.passwordHash,
        first_name: input.primerNombre ?? null,
        last_name: input.apellido ?? null,
      })
      .select('*')
      .single<UserRow>();

    if (error) throw new Error(`Error creando usuario: ${error.message}`);
    if (!data) throw new Error('No se retorno el usuario creado');
    return this.toEntity(data);
  }

  async update(id: string, data: UpdateUsuarioData): Promise<Usuario> {
    const patch: Record<string, unknown> = {};
    if (data.primerNombre !== undefined) patch.first_name = data.primerNombre;
    if (data.apellido !== undefined) patch.last_name = data.apellido;

    const { data: row, error } = await this.client
      .from('users')
      .update(patch)
      .eq('id', id)
      .select('*')
      .single<UserRow>();

    if (error) throw new Error(`Error actualizando usuario: ${error.message}`);
    if (!row) throw new Error('No se retorno el usuario actualizado');
    return this.toEntity(row);
  }

  async registrarLoginExitoso(id: string): Promise<void> {
    const { error } = await this.client
      .from('users')
      .update({ failed_login_attempts: 0, locked_until: null, last_login_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw new Error(`Error registrando login exitoso: ${error.message}`);
  }

  async registrarIntentoFallido(
    id: string,
    intentosFallidos: number,
    bloqueadoHasta: Date | null,
  ): Promise<void> {
    const { error } = await this.client
      .from('users')
      .update({
        failed_login_attempts: intentosFallidos,
        locked_until: bloqueadoHasta ? bloqueadoHasta.toISOString() : null,
      })
      .eq('id', id);
    if (error) throw new Error(`Error registrando intento fallido: ${error.message}`);
  }

  async marcarEmailVerificado(id: string): Promise<void> {
    const { error } = await this.client
      .from('users')
      .update({ email_verified_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw new Error(`Error marcando email verificado: ${error.message}`);
  }

  async actualizarPassword(id: string, passwordHash: string): Promise<void> {
    const { error } = await this.client.from('users').update({ password_hash: passwordHash }).eq('id', id);
    if (error) throw new Error(`Error actualizando password: ${error.message}`);
  }

  private toEntity(row: UserRow): Usuario {
    return new Usuario(
      row.id,
      row.email,
      row.first_name,
      row.last_name,
      row.email_verified_at ? new Date(row.email_verified_at) : null,
      row.is_active,
      row.deleted_at ? new Date(row.deleted_at) : null,
      row.failed_login_attempts,
      row.locked_until ? new Date(row.locked_until) : null,
      row.last_login_at ? new Date(row.last_login_at) : null,
      new Date(row.created_at),
    );
  }

  private toEntityWithPassword(row: UserRow): UsuarioWithPassword {
    const base = this.toEntity(row);
    return Object.assign(Object.create(base), base, { passwordHash: row.password_hash });
  }
}
