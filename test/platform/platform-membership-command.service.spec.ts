import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { PlatformMembershipCommandService } from '../../src/modules/platform/application/commands/platform-membership-command.service';
import { AUTH_REPOSITORY, IAuthRepository } from '../../src/modules/auth/domain/repositories/auth.repository.interface';
import { ITenantRepository, TENANT_REPOSITORY } from '../../src/modules/tenants/domain/repositories/tenant.repository.interface';
import { IRbacRepository, RBAC_REPOSITORY } from '../../src/modules/rbac/domain/repositories/rbac.repository.interface';
import { Usuario } from '../../src/modules/auth/domain/entities/usuario.entity';
import { Tenant } from '../../src/modules/tenants/domain/entities/tenant.entity';
import { Rol } from '../../src/modules/rbac/domain/entities/rol.entity';
import { Membresia } from '../../src/modules/rbac/domain/entities/membresia.entity';
import { AuditLogService } from '../../src/common/services/audit-log.service';
import { buildRbacRepositoryMock } from '../rbac/__helpers__/rbac-repository.mock';

const TENANT_ID = 'tenant-uuid-1';

const buildUsuario = (overrides: Partial<Usuario> = {}): Usuario =>
  new Usuario(
    overrides.id ?? 'usr-1',
    overrides.email ?? 'user@aureon.app',
    overrides.primerNombre ?? 'Ana',
    overrides.apellido ?? 'Perez',
    overrides.emailVerificadoEn ?? null,
    overrides.activo ?? true,
    overrides.eliminadoEn ?? null,
    overrides.intentosFallidos ?? 0,
    overrides.bloqueadoHasta ?? null,
    overrides.ultimoAcceso ?? null,
    overrides.fechaCreacion ?? new Date(),
    overrides.isPlatformAdmin ?? false,
  );

const buildTenant = (overrides: Partial<Tenant> = {}): Tenant =>
  new Tenant(
    overrides.id ?? TENANT_ID,
    overrides.codigo ?? 'acme-corp',
    overrides.nombre ?? 'Acme Corp',
    overrides.activo ?? true,
    overrides.configuracion ?? {},
    overrides.fechaCreacion ?? new Date(),
  );

const ROL_ADMINISTRADOR = new Rol('rol-admin', TENANT_ID, 'administrador', 'Administrador', null, true, true);
const ROL_TECNICO = new Rol('rol-tecnico', TENANT_ID, 'tecnico', 'Tecnico', null, true, true);

const buildMembresia = (overrides: Partial<Membresia> = {}): Membresia =>
  new Membresia(
    overrides.id ?? 'membresia-1',
    overrides.userId ?? 'usr-1',
    overrides.tenantId ?? TENANT_ID,
    overrides.rolId ?? ROL_TECNICO.id,
    overrides.activo ?? true,
    overrides.fechaIngreso ?? new Date(),
    overrides.fechaExpiracion ?? null,
    overrides.rol,
  );

describe('PlatformMembershipCommandService', () => {
  let service: PlatformMembershipCommandService;
  let authRepo: jest.Mocked<IAuthRepository>;
  let tenantRepo: jest.Mocked<ITenantRepository>;
  let rbacRepo: jest.Mocked<IRbacRepository>;

  beforeEach(async () => {
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
    const tenantRepoMock: jest.Mocked<ITenantRepository> = {
      crear: jest.fn(),
      findByCode: jest.fn(),
      findById: jest.fn(),
      listar: jest.fn(),
    };
    const rbacRepoMock = buildRbacRepositoryMock();

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        PlatformMembershipCommandService,
        { provide: AUTH_REPOSITORY, useValue: authRepoMock },
        { provide: TENANT_REPOSITORY, useValue: tenantRepoMock },
        { provide: RBAC_REPOSITORY, useValue: rbacRepoMock },
        { provide: AuditLogService, useValue: { registrar: jest.fn() } },
      ],
    }).compile();

    service = moduleRef.get(PlatformMembershipCommandService);
    authRepo = moduleRef.get(AUTH_REPOSITORY);
    tenantRepo = moduleRef.get(TENANT_REPOSITORY);
    rbacRepo = moduleRef.get(RBAC_REPOSITORY);
  });

  describe('create', () => {
    const input = { email: 'user@aureon.app', tenantCode: 'acme-corp', roleCode: 'tecnico' };

    it('lanza NotFoundException si el usuario no existe', async () => {
      authRepo.findByEmail.mockResolvedValue(null);
      await expect(service.create(input, 'platform-admin-1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('lanza NotFoundException si el tenant no existe', async () => {
      authRepo.findByEmail.mockResolvedValue(buildUsuario());
      tenantRepo.findByCode.mockResolvedValue(null);
      await expect(service.create(input, 'platform-admin-1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('lanza NotFoundException si el rol no existe en ese tenant', async () => {
      authRepo.findByEmail.mockResolvedValue(buildUsuario());
      tenantRepo.findByCode.mockResolvedValue(buildTenant());
      rbacRepo.buscarRolPorCodigo.mockResolvedValue(null);
      await expect(service.create(input, 'platform-admin-1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('crea la membresia cuando no existe ninguna previa', async () => {
      authRepo.findByEmail.mockResolvedValue(buildUsuario());
      tenantRepo.findByCode.mockResolvedValue(buildTenant());
      rbacRepo.buscarRolPorCodigo.mockResolvedValue(ROL_TECNICO);
      rbacRepo.buscarMembresia.mockResolvedValue(null);
      rbacRepo.crearMembresia.mockResolvedValue(buildMembresia());

      await service.create(input, 'platform-admin-1');

      expect(rbacRepo.crearMembresia).toHaveBeenCalledWith({
        userId: 'usr-1',
        tenantId: TENANT_ID,
        rolId: ROL_TECNICO.id,
      });
    });

    it('lanza ConflictException si ya existe una membresia activa para ese usuario y tenant', async () => {
      authRepo.findByEmail.mockResolvedValue(buildUsuario());
      tenantRepo.findByCode.mockResolvedValue(buildTenant());
      rbacRepo.buscarRolPorCodigo.mockResolvedValue(ROL_TECNICO);
      rbacRepo.buscarMembresia.mockResolvedValue(buildMembresia({ activo: true }));

      await expect(service.create(input, 'platform-admin-1')).rejects.toBeInstanceOf(ConflictException);
      expect(rbacRepo.crearMembresia).not.toHaveBeenCalled();
    });

    it('reactiva una membresia inactiva existente en vez de crear una nueva (unique[userId,tenantId])', async () => {
      authRepo.findByEmail.mockResolvedValue(buildUsuario());
      tenantRepo.findByCode.mockResolvedValue(buildTenant());
      rbacRepo.buscarRolPorCodigo.mockResolvedValue(ROL_TECNICO);
      rbacRepo.buscarMembresia.mockResolvedValue(buildMembresia({ id: 'membresia-vieja', activo: false }));
      rbacRepo.actualizarMembresia.mockResolvedValue(buildMembresia({ id: 'membresia-vieja', activo: true }));

      await service.create(input, 'platform-admin-1');

      expect(rbacRepo.actualizarMembresia).toHaveBeenCalledWith('membresia-vieja', {
        rolId: ROL_TECNICO.id,
        activo: true,
      });
      expect(rbacRepo.crearMembresia).not.toHaveBeenCalled();
    });
  });

  describe('updateRole', () => {
    it('lanza NotFoundException si la membresia no existe (sin restriccion de tenant)', async () => {
      rbacRepo.buscarMembresiaPorIdGlobal.mockResolvedValue(null);
      await expect(service.updateRole('no-existe', 'tecnico', 'platform-admin-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('bloquea sacar el rol administrador al ultimo administrador activo del tenant', async () => {
      rbacRepo.buscarMembresiaPorIdGlobal.mockResolvedValue(
        buildMembresia({ rolId: ROL_ADMINISTRADOR.id, rol: ROL_ADMINISTRADOR }),
      );
      rbacRepo.buscarRolPorCodigo.mockResolvedValue(ROL_TECNICO);
      rbacRepo.contarMembresiasActivasPorRolCodigo.mockResolvedValue(1);

      await expect(service.updateRole('membresia-1', 'tecnico', 'platform-admin-1')).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(rbacRepo.actualizarMembresia).not.toHaveBeenCalled();
    });

    it('permite el cambio de rol si hay mas de un administrador activo', async () => {
      rbacRepo.buscarMembresiaPorIdGlobal.mockResolvedValue(
        buildMembresia({ rolId: ROL_ADMINISTRADOR.id, rol: ROL_ADMINISTRADOR }),
      );
      rbacRepo.buscarRolPorCodigo.mockResolvedValue(ROL_TECNICO);
      rbacRepo.contarMembresiasActivasPorRolCodigo.mockResolvedValue(2);
      rbacRepo.actualizarMembresia.mockResolvedValue(buildMembresia({ rolId: ROL_TECNICO.id, rol: ROL_TECNICO }));

      await service.updateRole('membresia-1', 'tecnico', 'platform-admin-1');

      expect(rbacRepo.actualizarMembresia).toHaveBeenCalledWith('membresia-1', { rolId: ROL_TECNICO.id });
    });
  });

  describe('deactivate', () => {
    it('es idempotente: desactivar una membresia ya inactiva no llama a actualizarMembresia', async () => {
      rbacRepo.buscarMembresiaPorIdGlobal.mockResolvedValue(buildMembresia({ activo: false }));
      const result = await service.deactivate('membresia-1', 'platform-admin-1');
      expect(rbacRepo.actualizarMembresia).not.toHaveBeenCalled();
      expect(result.activo).toBe(false);
    });

    it('bloquea desactivar al ultimo administrador activo del tenant', async () => {
      rbacRepo.buscarMembresiaPorIdGlobal.mockResolvedValue(
        buildMembresia({ activo: true, rol: ROL_ADMINISTRADOR }),
      );
      rbacRepo.contarMembresiasActivasPorRolCodigo.mockResolvedValue(1);

      await expect(service.deactivate('membresia-1', 'platform-admin-1')).rejects.toBeInstanceOf(ConflictException);
      expect(rbacRepo.actualizarMembresia).not.toHaveBeenCalled();
    });
  });
});
