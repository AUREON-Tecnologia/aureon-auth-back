import { ConflictException, Inject, Injectable } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { ITenantRepository, TENANT_REPOSITORY } from '../../domain/repositories/tenant.repository.interface';
import { Tenant } from '../../domain/entities/tenant.entity';
import { AUTH_REPOSITORY, IAuthRepository } from '../../../auth/domain/repositories/auth.repository.interface';
import { IRbacRepository, RBAC_REPOSITORY } from '../../../rbac/domain/repositories/rbac.repository.interface';
import { RbacSeedService } from '../../../rbac/application/services/rbac-seed.service';
import { AuditLogService } from '../../../../common/services/audit-log.service';

export interface CrearTenantInput {
  codigoTenant: string;
  nombreTenant: string;
  emailAdmin: string;
  passwordAdmin: string;
  primerNombreAdmin?: string;
  apellidoAdmin?: string;
}

export interface TenantCreadoResult {
  tenant: Tenant;
  usuarioAdminId: string;
}

/** HU_13: crea el tenant + siembra sus 5 roles legacy + su primer usuario administrador, en un solo flujo. */
@Injectable()
export class TenantCommandService {
  private static readonly BCRYPT_ROUNDS = 10;

  constructor(
    @Inject(TENANT_REPOSITORY) private readonly tenantRepository: ITenantRepository,
    @Inject(AUTH_REPOSITORY) private readonly authRepository: IAuthRepository,
    @Inject(RBAC_REPOSITORY) private readonly rbacRepository: IRbacRepository,
    private readonly rbacSeedService: RbacSeedService,
    private readonly auditLog: AuditLogService,
  ) {}

  async crear(input: CrearTenantInput): Promise<TenantCreadoResult> {
    const existente = await this.tenantRepository.findByCode(input.codigoTenant);
    if (existente) {
      throw new ConflictException({ codigo: 'TENANT_YA_EXISTE', mensaje: 'Ya existe un tenant con ese codigo' });
    }

    const tenant = await this.tenantRepository.crear({ codigo: input.codigoTenant, nombre: input.nombreTenant });

    const rolesPorCodigo = await this.rbacSeedService.sembrarRolesLegacy(tenant.id);
    const rolAdminId = rolesPorCodigo.get('administrador');
    if (!rolAdminId) {
      throw new Error('No se pudo sembrar el rol administrador al crear el tenant');
    }

    // Bootstrap (detras de PlatformBootstrapGuard): a diferencia del auto-registro
    // publico, aqui SI se reutiliza un usuario global existente si el email ya
    // existe — es un flujo operado por quien tiene el secreto de plataforma, no
    // publico, por lo que el riesgo de "unirse sin probar posesion" no aplica igual.
    let usuarioAdmin = await this.authRepository.findByEmail(input.emailAdmin);
    if (!usuarioAdmin) {
      const passwordHash = await bcrypt.hash(input.passwordAdmin, TenantCommandService.BCRYPT_ROUNDS);
      usuarioAdmin = await this.authRepository.create({
        email: input.emailAdmin,
        passwordHash,
        primerNombre: input.primerNombreAdmin ?? null,
        apellido: input.apellidoAdmin ?? null,
      });
    }

    await this.rbacRepository.crearMembresia({
      userId: usuarioAdmin.id,
      tenantId: tenant.id,
      rolId: rolAdminId,
    });

    this.auditLog.registrar({
      evento: 'TENANT_CREADO',
      tenantId: tenant.id,
      usuarioId: usuarioAdmin.id,
      email: usuarioAdmin.email,
    });

    return { tenant, usuarioAdminId: usuarioAdmin.id };
  }
}
