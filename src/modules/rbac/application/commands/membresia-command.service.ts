import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { IRbacRepository, RBAC_REPOSITORY } from '../../domain/repositories/rbac.repository.interface';
import { Membresia } from '../../domain/entities/membresia.entity';
import { AuditLogService } from '../../../../common/services/audit-log.service';

export interface ActualizarMembresiaInput {
  rolId?: string;
  activo?: boolean;
}

/** HU_13: gestion administrativa de miembros de un tenant (reemplaza HU_06 sobre el modelo nuevo). */
@Injectable()
export class MembresiaCommandService {
  constructor(
    @Inject(RBAC_REPOSITORY) private readonly rbacRepository: IRbacRepository,
    private readonly auditLog: AuditLogService,
  ) {}

  async actualizar(
    id: string,
    tenantId: string,
    input: ActualizarMembresiaInput,
    actorId: string,
  ): Promise<Membresia> {
    await this.exigirExistente(id, tenantId);
    const actualizada = await this.rbacRepository.actualizarMembresia(id, input);
    this.auditLog.registrar({
      evento: 'MEMBRESIA_ACTUALIZADA',
      usuarioId: actualizada.userId,
      tenantId,
      actorId,
      detalle: { ...input },
    });
    return actualizada;
  }

  /** Baja logica: desactiva la membresia a ESTE tenant, nunca el usuario global (podria pertenecer a otros tenants). */
  async desactivar(id: string, tenantId: string, actorId: string): Promise<Membresia> {
    const existente = await this.exigirExistente(id, tenantId);
    if (!existente.activo) {
      return existente;
    }
    const actualizada = await this.rbacRepository.actualizarMembresia(id, { activo: false });
    this.auditLog.registrar({
      evento: 'MEMBRESIA_DESACTIVADA',
      usuarioId: existente.userId,
      tenantId,
      actorId,
    });
    return actualizada;
  }

  private async exigirExistente(id: string, tenantId: string): Promise<Membresia> {
    const existente = await this.rbacRepository.buscarMembresiaPorId(id, tenantId);
    if (!existente) {
      throw new NotFoundException({ codigo: 'MEMBRESIA_NOT_FOUND', mensaje: 'Membresia no encontrada' });
    }
    return existente;
  }
}
