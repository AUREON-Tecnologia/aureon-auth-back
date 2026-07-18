import { Paginacion } from '../../../../common/domain/paginacion-meta';
import { Tenant } from '../entities/tenant.entity';

export const TENANT_REPOSITORY = Symbol('ITenantRepository');

export interface CrearTenantData {
  codigo: string;
  nombre: string;
  configuracion?: Record<string, unknown>;
}

/** HU_13: respaldo de la tabla `tenants`. */
export interface ITenantRepository {
  crear(data: CrearTenantData): Promise<Tenant>;
  findByCode(codigo: string): Promise<Tenant | null>;
  findById(id: string): Promise<Tenant | null>;
  listar(paginacion: Paginacion): Promise<{ data: Tenant[]; total: number }>;
}
