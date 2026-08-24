import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { TenantCommandService } from '../../src/modules/tenants/application/commands/tenant-command.service';
import { ITenantRepository, TENANT_REPOSITORY } from '../../src/modules/tenants/domain/repositories/tenant.repository.interface';
import { Tenant } from '../../src/modules/tenants/domain/entities/tenant.entity';
import { AUTH_REPOSITORY, IAuthRepository } from '../../src/modules/auth/domain/repositories/auth.repository.interface';
import { Usuario } from '../../src/modules/auth/domain/entities/usuario.entity';
import { IRbacRepository, RBAC_REPOSITORY } from '../../src/modules/rbac/domain/repositories/rbac.repository.interface';
import { RbacSeedService } from '../../src/modules/rbac/application/services/rbac-seed.service';
import { buildRbacRepositoryMock } from '../rbac/__helpers__/rbac-repository.mock';
import { AuditLogService } from '../../src/common/services/audit-log.service';

const buildTenant = (): Tenant => new Tenant('tenant-1', 'acme-corp', 'Acme Corp', true, {}, new Date());

const buildUsuario = (overrides: Partial<Usuario> = {}): Usuario =>
  new Usuario(
    overrides.id ?? 'usr-admin-1',
    overrides.email ?? 'admin@acme.com',
    overrides.primerNombre ?? null,
    overrides.apellido ?? null,
    overrides.emailVerificadoEn ?? null,
    overrides.activo ?? true,
    overrides.eliminadoEn ?? null,
    overrides.intentosFallidos ?? 0,
    overrides.bloqueadoHasta ?? null,
    overrides.ultimoAcceso ?? null,
    overrides.fechaCreacion ?? new Date(),
  );

describe('TenantCommandService', () => {
  let service: TenantCommandService;
  let tenantRepo: jest.Mocked<ITenantRepository>;
  let authRepo: jest.Mocked<IAuthRepository>;
  let rbacRepo: jest.Mocked<IRbacRepository>;
  let rbacSeedService: jest.Mocked<RbacSeedService>;

  const inputBase = {
    codigoTenant: 'acme-corp',
    nombreTenant: 'Acme Corp',
    emailAdmin: 'admin@acme.com',
    passwordAdmin: 'Password123!',
  };

  beforeEach(async () => {
    const tenantRepoMock: jest.Mocked<ITenantRepository> = {
      crear: jest.fn(),
      findByCode: jest.fn(),
      findById: jest.fn(),
      listar: jest.fn(),
    };

    const authRepoMock: jest.Mocked<IAuthRepository> = {
      findById: jest.fn(),
      findByEmail: jest.fn(),
      findByEmailWithPassword: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      registrarLoginExitoso: jest.fn(),
      registrarIntentoFallido: jest.fn(),
      marcarEmailVerificado: jest.fn(),
      actualizarPassword: jest.fn(),
      setPlatformAdmin: jest.fn(),
      listarAdministradoresPlataforma: jest.fn(),
    };

    const rbacRepoMock = buildRbacRepositoryMock();

    const rbacSeedMock = { sembrarRolesLegacy: jest.fn() } as unknown as jest.Mocked<RbacSeedService>;

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        TenantCommandService,
        { provide: TENANT_REPOSITORY, useValue: tenantRepoMock },
        { provide: AUTH_REPOSITORY, useValue: authRepoMock },
        { provide: RBAC_REPOSITORY, useValue: rbacRepoMock },
        { provide: RbacSeedService, useValue: rbacSeedMock },
        { provide: AuditLogService, useValue: { registrar: jest.fn() } },
      ],
    }).compile();

    service = moduleRef.get(TenantCommandService);
    tenantRepo = moduleRef.get(TENANT_REPOSITORY);
    authRepo = moduleRef.get(AUTH_REPOSITORY);
    rbacRepo = moduleRef.get(RBAC_REPOSITORY);
    rbacSeedService = moduleRef.get(RbacSeedService);
  });

  it('camino feliz: crea el tenant, siembra roles, crea el usuario admin y su membresia', async () => {
    tenantRepo.findByCode.mockResolvedValue(null);
    const tenant = buildTenant();
    tenantRepo.crear.mockResolvedValue(tenant);
    rbacSeedService.sembrarRolesLegacy.mockResolvedValue(new Map([['administrador', 'rol-admin-1']]));
    authRepo.findByEmail.mockResolvedValue(null);
    const admin = buildUsuario();
    authRepo.create.mockImplementation(async (data) => {
      expect(data.passwordHash).toMatch(/^\$2[aby]\$/);
      return admin;
    });

    const result = await service.crear(inputBase);

    expect(result.tenant).toBe(tenant);
    expect(result.usuarioAdminId).toBe(admin.id);
    expect(rbacRepo.crearMembresia).toHaveBeenCalledWith({
      userId: admin.id,
      tenantId: tenant.id,
      rolId: 'rol-admin-1',
    });
  });

  it('lanza ConflictException si el codigo del tenant ya existe', async () => {
    tenantRepo.findByCode.mockResolvedValue(buildTenant());
    await expect(service.crear(inputBase)).rejects.toBeInstanceOf(ConflictException);
    expect(tenantRepo.crear).not.toHaveBeenCalled();
  });

  it('reutiliza un usuario global existente como admin en vez de crear uno nuevo', async () => {
    tenantRepo.findByCode.mockResolvedValue(null);
    tenantRepo.crear.mockResolvedValue(buildTenant());
    rbacSeedService.sembrarRolesLegacy.mockResolvedValue(new Map([['administrador', 'rol-admin-1']]));
    const existente = buildUsuario();
    authRepo.findByEmail.mockResolvedValue(existente);

    const result = await service.crear(inputBase);

    expect(authRepo.create).not.toHaveBeenCalled();
    expect(result.usuarioAdminId).toBe(existente.id);
  });
});
