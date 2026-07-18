import { Inject, Injectable } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_CLIENT } from '../../../../common/supabase/supabase-client.provider';
import {
  BuscarTokenValidoParams,
  CrearTokenVerificacionData,
  IOtpRepository,
} from '../../domain/repositories/otp.repository.interface';
import { PropositoOtp, TokenVerificacion } from '../../domain/entities/token-verificacion.entity';

/** Columnas reales de identity.token_verificacion, ver docus/scripts-v2/aureon_ddl_01_identity.sql */
interface TokenVerificacionRow {
  id: string;
  id_cliente: string | null;
  numero_telefono: string | null;
  email: string | null;
  token: string;
  proposito: PropositoOtp;
  expira_en: string;
  usado: boolean;
  created_at: string;
}

@Injectable()
export class SupabaseOtpRepository implements IOtpRepository {
  constructor(@Inject(SUPABASE_CLIENT) private readonly client: SupabaseClient) {}

  async crear(data: CrearTokenVerificacionData): Promise<TokenVerificacion> {
    const { data: row, error } = await this.client
      .from('token_verificacion')
      .insert({
        id_cliente: data.idCliente ?? null,
        numero_telefono: data.numeroTelefono ?? null,
        email: data.email ?? null,
        token: data.token,
        proposito: data.proposito,
        expira_en: data.expiraEn.toISOString(),
      })
      .select('*')
      .single<TokenVerificacionRow>();

    if (error) {
      throw new Error(`Error creando token de verificacion: ${error.message}`);
    }
    if (!row) {
      throw new Error('No se retorno el token de verificacion creado');
    }
    return this.toEntity(row);
  }

  async buscarValido(params: BuscarTokenValidoParams): Promise<TokenVerificacion | null> {
    let query = this.client
      .from('token_verificacion')
      .select('*')
      .eq('proposito', params.proposito)
      .eq('token', params.token)
      .eq('usado', false)
      .gt('expira_en', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1);

    if (params.numeroTelefono) {
      query = query.eq('numero_telefono', params.numeroTelefono);
    } else if (params.email) {
      query = query.eq('email', params.email);
    }

    const { data, error } = await query.maybeSingle<TokenVerificacionRow>();
    if (error) {
      throw new Error(`Error consultando token de verificacion: ${error.message}`);
    }
    return data ? this.toEntity(data) : null;
  }

  async marcarUsado(id: string): Promise<void> {
    const { error } = await this.client.from('token_verificacion').update({ usado: true }).eq('id', id);
    if (error) {
      throw new Error(`Error marcando token de verificacion como usado: ${error.message}`);
    }
  }

  private toEntity(row: TokenVerificacionRow): TokenVerificacion {
    return new TokenVerificacion(
      row.id,
      row.id_cliente,
      row.numero_telefono,
      row.email,
      row.token,
      row.proposito,
      new Date(row.expira_en),
      row.usado,
      new Date(row.created_at),
    );
  }
}
