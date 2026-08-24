import { ConflictException } from '@nestjs/common';
import { IRbacRepository } from '../../domain/repositories/rbac.repository.interface';
import { Membresia } from '../../domain/entities/membresia.entity';

/** Codigo del rol que no puede llegar a 0 miembros activos en un tenant. */
export const CODIGO_ROL_ADMINISTRADOR = 'administrador';

/**
 * Bloquea dejar un tenant sin ningun administrador activo: no-op si la membresia
 * no es del rol administrador; si lo es, exige que haya mas de 1 activa antes de
 * permitir que esta se desactive o cambie de rol. Compartido entre
 * MembresiaCommandService (scoped al propio tenant) y PlatformMembershipCommandService
 * (cross-tenant) -- misma regla, dos superficies de API distintas.
 */
export async function exigirNoUltimoAdministrador(
  rbacRepository: IRbacRepository,
  membresia: Membresia,
  tenantId: string,
): Promise<void> {
  if (membresia.rol?.codigo !== CODIGO_ROL_ADMINISTRADOR) {
    return;
  }
  const activos = await rbacRepository.contarMembresiasActivasPorRolCodigo(tenantId, CODIGO_ROL_ADMINISTRADOR);
  if (activos <= 1) {
    throw new ConflictException({
      codigo: 'ULTIMO_ADMINISTRADOR',
      mensaje: 'No se puede dejar al tenant sin ningun administrador activo',
    });
  }
}
