import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { AUTH_REPOSITORY, IAuthRepository } from '../../../auth/domain/repositories/auth.repository.interface';
import { ITenantRepository, TENANT_REPOSITORY } from '../../../tenants/domain/repositories/tenant.repository.interface';
import { IRbacRepository, RBAC_REPOSITORY } from '../../../rbac/domain/repositories/rbac.repository.interface';
import { Membresia } from '../../../rbac/domain/entities/membresia.entity';
import { exigirNoUltimoAdministrador } from '../../../rbac/application/utils/ultimo-administrador.util';
import { AuditLogService } from '../../../../common/services/audit-log.service';

export interface CreatePlatformMembershipInput {
  email: string;
  tenantCode: string;
  roleCode: string;
}

/**
 * Cross-tenant counterpart of MembresiaCommandService (decision 2026-08-23):
 * grants/updates/deactivates a membership for ANY tenant, not just the
 * caller's own -- gated by PlatformAdminGuard at the controller instead of
 * the tenant-scoped `administrador` role. See CLAUDE.md.
 */
@Injectable()
export class PlatformMembershipCommandService {
  constructor(
    @Inject(AUTH_REPOSITORY) private readonly authRepository: IAuthRepository,
    @Inject(TENANT_REPOSITORY) private readonly tenantRepository: ITenantRepository,
    @Inject(RBAC_REPOSITORY) private readonly rbacRepository: IRbacRepository,
    private readonly auditLog: AuditLogService,
  ) {}

  /**
   * `user_tenant_memberships` has @@unique([userId, tenantId]) -- a second
   * membership for the same pair can't be inserted. An existing INACTIVE
   * membership is reactivated with the requested role instead of erroring,
   * so a previously-removed user can be re-granted access without a DB-level
   * conflict; an existing ACTIVE one is a real 409 (use updateRole instead).
   */
  async create(input: CreatePlatformMembershipInput, actorId: string): Promise<Membresia> {
    const user = await this.authRepository.findByEmail(input.email);
    if (!user) {
      throw new NotFoundException({ codigo: 'USUARIO_NOT_FOUND', mensaje: 'Usuario no encontrado' });
    }
    const tenant = await this.tenantRepository.findByCode(input.tenantCode);
    if (!tenant) {
      throw new NotFoundException({ codigo: 'TENANT_NOT_FOUND', mensaje: 'Tenant no encontrado' });
    }
    const role = await this.rbacRepository.buscarRolPorCodigo(tenant.id, input.roleCode);
    if (!role) {
      throw new NotFoundException({ codigo: 'ROL_NOT_FOUND', mensaje: 'Rol no encontrado en ese tenant' });
    }

    const existing = await this.rbacRepository.buscarMembresia(user.id, tenant.id);
    let membership: Membresia;
    if (existing) {
      if (existing.activo) {
        throw new ConflictException({
          codigo: 'MEMBRESIA_YA_ACTIVA',
          mensaje: 'El usuario ya tiene una membresia activa en ese tenant',
        });
      }
      membership = await this.rbacRepository.actualizarMembresia(existing.id, { rolId: role.id, activo: true });
    } else {
      membership = await this.rbacRepository.crearMembresia({ userId: user.id, tenantId: tenant.id, rolId: role.id });
    }

    this.auditLog.registrar({
      evento: 'MEMBRESIA_CREADA',
      usuarioId: user.id,
      tenantId: tenant.id,
      actorId,
      detalle: { roleCode: input.roleCode, viaPlatformAdmin: true },
    });
    return membership;
  }

  async updateRole(id: string, roleCode: string, actorId: string): Promise<Membresia> {
    const existing = await this.findOrThrow(id);
    const role = await this.rbacRepository.buscarRolPorCodigo(existing.tenantId, roleCode);
    if (!role) {
      throw new NotFoundException({ codigo: 'ROL_NOT_FOUND', mensaje: 'Rol no encontrado en ese tenant' });
    }
    if (role.id !== existing.rolId) {
      await exigirNoUltimoAdministrador(this.rbacRepository, existing, existing.tenantId);
    }
    const updated = await this.rbacRepository.actualizarMembresia(id, { rolId: role.id });
    this.auditLog.registrar({
      evento: 'MEMBRESIA_ACTUALIZADA',
      usuarioId: existing.userId,
      tenantId: existing.tenantId,
      actorId,
      detalle: { roleCode, viaPlatformAdmin: true },
    });
    return updated;
  }

  async deactivate(id: string, actorId: string): Promise<Membresia> {
    const existing = await this.findOrThrow(id);
    if (!existing.activo) {
      return existing;
    }
    await exigirNoUltimoAdministrador(this.rbacRepository, existing, existing.tenantId);
    const updated = await this.rbacRepository.actualizarMembresia(id, { activo: false });
    this.auditLog.registrar({
      evento: 'MEMBRESIA_DESACTIVADA',
      usuarioId: existing.userId,
      tenantId: existing.tenantId,
      actorId,
      detalle: { viaPlatformAdmin: true },
    });
    return updated;
  }

  private async findOrThrow(id: string): Promise<Membresia> {
    const existing = await this.rbacRepository.buscarMembresiaPorIdGlobal(id);
    if (!existing) {
      throw new NotFoundException({ codigo: 'MEMBRESIA_NOT_FOUND', mensaje: 'Membresia no encontrada' });
    }
    return existing;
  }
}
