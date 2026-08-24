import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { AUTH_REPOSITORY, IAuthRepository } from '../../../auth/domain/repositories/auth.repository.interface';
import { Usuario } from '../../../auth/domain/entities/usuario.entity';
import { AuditLogService } from '../../../../common/services/audit-log.service';

/**
 * Grants/revokes the platform-wide admin flag (decision 2026-08-23) -- gated
 * by PlatformBootstrapGuard at the controller, same shared-secret pattern as
 * POST /tenants. See CLAUDE.md for why this is a boolean on the global user
 * instead of a tenant-scoped role.
 */
@Injectable()
export class PlatformAdminCommandService {
  constructor(
    @Inject(AUTH_REPOSITORY) private readonly authRepository: IAuthRepository,
    private readonly auditLog: AuditLogService,
  ) {}

  async grant(email: string): Promise<Usuario> {
    const user = await this.findUserOrThrow(email);
    const updated = await this.authRepository.setPlatformAdmin(user.id, true);
    this.auditLog.registrar({ evento: 'PLATFORM_ADMIN_OTORGADO', usuarioId: user.id, email: user.email });
    return updated;
  }

  async revoke(userId: string): Promise<Usuario> {
    const user = await this.authRepository.findById(userId);
    if (!user) {
      throw new NotFoundException({ codigo: 'USUARIO_NOT_FOUND', mensaje: 'Usuario no encontrado' });
    }
    const updated = await this.authRepository.setPlatformAdmin(userId, false);
    this.auditLog.registrar({ evento: 'PLATFORM_ADMIN_REVOCADO', usuarioId: userId, email: user.email });
    return updated;
  }

  list(): Promise<Usuario[]> {
    return this.authRepository.listarAdministradoresPlataforma();
  }

  private async findUserOrThrow(email: string): Promise<Usuario> {
    const user = await this.authRepository.findByEmail(email);
    if (!user) {
      throw new NotFoundException({ codigo: 'USUARIO_NOT_FOUND', mensaje: 'Usuario no encontrado' });
    }
    return user;
  }
}
