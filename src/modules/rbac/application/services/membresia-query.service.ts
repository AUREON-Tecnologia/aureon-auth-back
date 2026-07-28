import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { IRbacRepository, RBAC_REPOSITORY } from '../../domain/repositories/rbac.repository.interface';
import { Membresia } from '../../domain/entities/membresia.entity';
import { Paginacion, PaginacionMeta } from '../../../../common/domain/paginacion-meta';

@Injectable()
export class MembresiaQueryService {
  constructor(@Inject(RBAC_REPOSITORY) private readonly rbacRepository: IRbacRepository) {}

  async obtener(id: string, tenantId: string): Promise<Membresia> {
    const membresia = await this.rbacRepository.buscarMembresiaPorId(id, tenantId);
    if (!membresia) {
      throw new NotFoundException({ codigo: 'MEMBRESIA_NOT_FOUND', mensaje: 'Membresia no encontrada' });
    }
    return membresia;
  }

  async listar(
    tenantId: string,
    filtros: { activo?: boolean },
    paginacion: Paginacion,
  ): Promise<{ data: Membresia[]; meta: PaginacionMeta }> {
    const { data, total } = await this.rbacRepository.listarMembresias(tenantId, filtros, paginacion);
    const totalPaginas = Math.max(1, Math.ceil(total / paginacion.tamanioPagina));
    return {
      data,
      meta: { pagina: paginacion.pagina, tamanioPagina: paginacion.tamanioPagina, total, totalPaginas },
    };
  }
}
