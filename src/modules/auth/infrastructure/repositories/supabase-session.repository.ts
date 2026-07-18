import { Inject, Injectable } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_CLIENT } from '../../../../common/supabase/supabase-client.provider';
import {
  CreateSesionData,
  ISessionRepository,
  SesionUsuario,
} from '../../domain/repositories/session.repository.interface';

/** Columnas reales de identity.sesion_usuario, ver docus/scripts-v2/aureon_ddl_01_identity.sql */
interface SesionRow {
  id: string;
  id_usuario: string;
  token_hash: string;
  expira_en: string;
  ip_origen: string | null;
  activa: boolean;
  created_at: string;
}

@Injectable()
export class SupabaseSessionRepository implements ISessionRepository {
  constructor(@Inject(SUPABASE_CLIENT) private readonly client: SupabaseClient) {}

  async create(data: CreateSesionData): Promise<SesionUsuario> {
    const { data: row, error } = await this.client
      .from('sesion_usuario')
      .insert({
        id_usuario: data.idUsuario,
        token_hash: data.tokenHash,
        expira_en: data.expiraEn.toISOString(),
        ip_origen: data.ipOrigen ?? null,
      })
      .select('*')
      .single<SesionRow>();

    if (error) {
      throw new Error(`Error creando sesion: ${error.message}`);
    }
    if (!row) {
      throw new Error('No se retorno la sesion creada');
    }
    return this.toEntity(row);
  }

  async findByTokenHash(tokenHash: string): Promise<SesionUsuario | null> {
    const { data, error } = await this.client
      .from('sesion_usuario')
      .select('*')
      .eq('token_hash', tokenHash)
      .maybeSingle<SesionRow>();

    if (error) {
      throw new Error(`Error consultando sesion: ${error.message}`);
    }
    return data ? this.toEntity(data) : null;
  }

  async invalidate(id: string): Promise<void> {
    const { error } = await this.client.from('sesion_usuario').update({ activa: false }).eq('id', id);
    if (error) {
      throw new Error(`Error invalidando sesion: ${error.message}`);
    }
  }

  private toEntity(row: SesionRow): SesionUsuario {
    return {
      id: row.id,
      idUsuario: row.id_usuario,
      expiraEn: new Date(row.expira_en),
      activa: row.activa,
      creadaEn: new Date(row.created_at),
    };
  }
}
