import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ITenantRepository, TENANT_REPOSITORY } from '../../domain/repositories/tenant.repository.interface';
import { Tenant } from '../../domain/entities/tenant.entity';
import { Paginacion, PaginacionMeta } from '../../../../common/domain/paginacion-meta';

@Injectable()
export class TenantQueryService {
  constructor(@Inject(TENANT_REPOSITORY) private readonly tenantRepository: ITenantRepository) {}

  async obtener(id: string): Promise<Tenant> {
    const tenant = await this.tenantRepository.findById(id);
    if (!tenant) {
      throw new NotFoundException({ codigo: 'TENANT_NOT_FOUND', mensaje: 'Tenant no encontrado' });
    }
    return tenant;
  }

  async listar(paginacion: Paginacion): Promise<{ data: Tenant[]; meta: PaginacionMeta }> {
    const { data, total } = await this.tenantRepository.listar(paginacion);
    const totalPaginas = Math.max(1, Math.ceil(total / paginacion.tamanioPagina));
    return {
      data,
      meta: { pagina: paginacion.pagina, tamanioPagina: paginacion.tamanioPagina, total, totalPaginas },
    };
  }
}
