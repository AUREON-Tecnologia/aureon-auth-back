import { Inject, Injectable } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_CLIENT } from '../../../../common/supabase/supabase-client.provider';
import { Paginacion } from '../../../../common/domain/paginacion-meta';
import { CrearTenantData, ITenantRepository } from '../../domain/repositories/tenant.repository.interface';
import { Tenant } from '../../domain/entities/tenant.entity';

/** Columnas reales de `tenants`, ver docus/scripts-v3/scripts-auth.sql */
interface TenantRow {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
  settings: Record<string, unknown>;
  created_at: string;
}

@Injectable()
export class SupabaseTenantRepository implements ITenantRepository {
  constructor(@Inject(SUPABASE_CLIENT) private readonly client: SupabaseClient) {}

  async crear(data: CrearTenantData): Promise<Tenant> {
    const { data: row, error } = await this.client
      .from('tenants')
      .insert({ code: data.codigo, name: data.nombre, settings: data.configuracion ?? {} })
      .select('*')
      .single<TenantRow>();

    if (error) throw new Error(`Error creando tenant: ${error.message}`);
    if (!row) throw new Error('No se retorno el tenant creado');
    return this.toEntity(row);
  }

  async findByCode(codigo: string): Promise<Tenant | null> {
    const { data, error } = await this.client
      .from('tenants')
      .select('*')
      .eq('code', codigo)
      .maybeSingle<TenantRow>();
    if (error) throw new Error(`Error consultando tenant por codigo: ${error.message}`);
    return data ? this.toEntity(data) : null;
  }

  async findById(id: string): Promise<Tenant | null> {
    const { data, error } = await this.client.from('tenants').select('*').eq('id', id).maybeSingle<TenantRow>();
    if (error) throw new Error(`Error consultando tenant por id: ${error.message}`);
    return data ? this.toEntity(data) : null;
  }

  async listar(paginacion: Paginacion): Promise<{ data: Tenant[]; total: number }> {
    const desde = (paginacion.pagina - 1) * paginacion.tamanioPagina;
    const hasta = desde + paginacion.tamanioPagina - 1;

    const { data, error, count } = await this.client
      .from('tenants')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(desde, hasta)
      .returns<TenantRow[]>();

    if (error) throw new Error(`Error listando tenants: ${error.message}`);
    return { data: (data ?? []).map((row) => this.toEntity(row)), total: count ?? 0 };
  }

  private toEntity(row: TenantRow): Tenant {
    return new Tenant(row.id, row.code, row.name, row.is_active, row.settings ?? {}, new Date(row.created_at));
  }
}
