import { Inject, Injectable } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_CLIENT } from '../../../../common/supabase/supabase-client.provider';
import {
  CreateSesionData,
  ISessionRepository,
} from '../../domain/repositories/session.repository.interface';
import { Sesion } from '../../domain/entities/sesion.entity';

/** Columnas reales de `user_sessions`, ver docus/scripts-v3/scripts-auth.sql */
interface SesionRow {
  id: string;
  user_id: string;
  tenant_id: string;
  refresh_token_hash: string;
  user_agent: string | null;
  ip_address: string | null;
  expires_at: string;
  revoked_at: string | null;
  created_at: string;
}

@Injectable()
export class SupabaseSessionRepository implements ISessionRepository {
  constructor(@Inject(SUPABASE_CLIENT) private readonly client: SupabaseClient) {}

  async create(data: CreateSesionData): Promise<Sesion> {
    const { data: row, error } = await this.client
      .from('user_sessions')
      .insert({
        user_id: data.userId,
        tenant_id: data.tenantId,
        refresh_token_hash: data.tokenHash,
        expires_at: data.expiraEn.toISOString(),
        user_agent: data.userAgent ?? null,
        ip_address: data.ipAddress ?? null,
      })
      .select('*')
      .single<SesionRow>();

    if (error) throw new Error(`Error creando sesion: ${error.message}`);
    if (!row) throw new Error('No se retorno la sesion creada');
    return this.toEntity(row);
  }

  async findByTokenHash(tokenHash: string): Promise<Sesion | null> {
    const { data, error } = await this.client
      .from('user_sessions')
      .select('*')
      .eq('refresh_token_hash', tokenHash)
      .maybeSingle<SesionRow>();

    if (error) throw new Error(`Error consultando sesion: ${error.message}`);
    return data ? this.toEntity(data) : null;
  }

  async invalidate(id: string): Promise<void> {
    const { error } = await this.client
      .from('user_sessions')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw new Error(`Error invalidando sesion: ${error.message}`);
  }

  async invalidateAllForUser(userId: string): Promise<void> {
    const { error } = await this.client
      .from('user_sessions')
      .update({ revoked_at: new Date().toISOString() })
      .eq('user_id', userId)
      .is('revoked_at', null);
    if (error) throw new Error(`Error invalidando sesiones del usuario: ${error.message}`);
  }

  private toEntity(row: SesionRow): Sesion {
    return new Sesion(
      row.id,
      row.user_id,
      row.tenant_id,
      new Date(row.expires_at),
      row.revoked_at ? new Date(row.revoked_at) : null,
      row.user_agent,
      row.ip_address,
      new Date(row.created_at),
    );
  }
}
