import { Inject, Injectable } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_CLIENT } from '../../../../common/supabase/supabase-client.provider';
import {
  CrearUserTokenData,
  IUserTokenRepository,
} from '../../domain/repositories/user-token.repository.interface';
import { TipoUserToken, UserToken } from '../../domain/entities/user-token.entity';

/** Columnas reales de `user_tokens`, ver docus/scripts-v3/scripts-auth.sql */
interface UserTokenRow {
  id: string;
  user_id: string;
  type: TipoUserToken;
  expires_at: string;
  used_at: string | null;
  created_at: string;
}

@Injectable()
export class SupabaseUserTokenRepository implements IUserTokenRepository {
  constructor(@Inject(SUPABASE_CLIENT) private readonly client: SupabaseClient) {}

  async crear(data: CrearUserTokenData): Promise<UserToken> {
    const { data: row, error } = await this.client
      .from('user_tokens')
      .insert({
        user_id: data.userId,
        type: data.tipo,
        token_hash: data.tokenHash,
        expires_at: data.expiraEn.toISOString(),
      })
      .select('*')
      .single<UserTokenRow>();

    if (error) throw new Error(`Error creando user token: ${error.message}`);
    if (!row) throw new Error('No se retorno el token creado');
    return this.toEntity(row);
  }

  async buscarVigentePorHash(tokenHash: string, tipo: TipoUserToken): Promise<UserToken | null> {
    const { data, error } = await this.client
      .from('user_tokens')
      .select('*')
      .eq('token_hash', tokenHash)
      .eq('type', tipo)
      .is('used_at', null)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle<UserTokenRow>();

    if (error) throw new Error(`Error consultando user token: ${error.message}`);
    return data ? this.toEntity(data) : null;
  }

  async marcarUsado(id: string): Promise<void> {
    const { error } = await this.client
      .from('user_tokens')
      .update({ used_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw new Error(`Error marcando user token como usado: ${error.message}`);
  }

  private toEntity(row: UserTokenRow): UserToken {
    return new UserToken(
      row.id,
      row.user_id,
      row.type,
      new Date(row.expires_at),
      row.used_at ? new Date(row.used_at) : null,
      new Date(row.created_at),
    );
  }
}
