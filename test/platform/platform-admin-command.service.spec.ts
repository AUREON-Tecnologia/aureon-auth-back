import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { PlatformAdminCommandService } from '../../src/modules/platform/application/commands/platform-admin-command.service';
import { AUTH_REPOSITORY, IAuthRepository } from '../../src/modules/auth/domain/repositories/auth.repository.interface';
import { Usuario } from '../../src/modules/auth/domain/entities/usuario.entity';
import { AuditLogService } from '../../src/common/services/audit-log.service';

const buildUsuario = (overrides: Partial<Usuario> = {}): Usuario =>
  new Usuario(
    overrides.id ?? 'usr-1',
    overrides.email ?? 'admin@aureon.app',
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

describe('PlatformAdminCommandService', () => {
  let service: PlatformAdminCommandService;
  let authRepo: jest.Mocked<IAuthRepository>;
  let auditLog: jest.Mocked<AuditLogService>;

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

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        PlatformAdminCommandService,
        { provide: AUTH_REPOSITORY, useValue: authRepoMock },
        { provide: AuditLogService, useValue: { registrar: jest.fn() } },
      ],
    }).compile();

    service = moduleRef.get(PlatformAdminCommandService);
    authRepo = moduleRef.get(AUTH_REPOSITORY);
    auditLog = moduleRef.get(AuditLogService);
  });

  describe('grant', () => {
    it('otorga el flag y audita el evento', async () => {
      const user = buildUsuario();
      authRepo.findByEmail.mockResolvedValue(user);
      authRepo.setPlatformAdmin.mockResolvedValue(buildUsuario({ isPlatformAdmin: true }));

      const result = await service.grant('admin@aureon.app');

      expect(authRepo.setPlatformAdmin).toHaveBeenCalledWith('usr-1', true);
      expect(result.isPlatformAdmin).toBe(true);
      expect(auditLog.registrar).toHaveBeenCalledWith(
        expect.objectContaining({ evento: 'PLATFORM_ADMIN_OTORGADO', usuarioId: 'usr-1' }),
      );
    });

    it('lanza NotFoundException si el email no corresponde a un usuario existente', async () => {
      authRepo.findByEmail.mockResolvedValue(null);
      await expect(service.grant('no-existe@aureon.app')).rejects.toBeInstanceOf(NotFoundException);
      expect(authRepo.setPlatformAdmin).not.toHaveBeenCalled();
    });

    it('es idempotente: otorgar a alguien que ya lo es no falla', async () => {
      const user = buildUsuario({ isPlatformAdmin: true });
      authRepo.findByEmail.mockResolvedValue(user);
      authRepo.setPlatformAdmin.mockResolvedValue(user);

      const result = await service.grant('admin@aureon.app');

      expect(result.isPlatformAdmin).toBe(true);
    });
  });

  describe('revoke', () => {
    it('revoca el flag y audita el evento', async () => {
      const user = buildUsuario({ isPlatformAdmin: true });
      authRepo.findById.mockResolvedValue(user);
      authRepo.setPlatformAdmin.mockResolvedValue(buildUsuario({ isPlatformAdmin: false }));

      const result = await service.revoke('usr-1');

      expect(authRepo.setPlatformAdmin).toHaveBeenCalledWith('usr-1', false);
      expect(result.isPlatformAdmin).toBe(false);
      expect(auditLog.registrar).toHaveBeenCalledWith(
        expect.objectContaining({ evento: 'PLATFORM_ADMIN_REVOCADO', usuarioId: 'usr-1' }),
      );
    });

    it('lanza NotFoundException si el userId no existe', async () => {
      authRepo.findById.mockResolvedValue(null);
      await expect(service.revoke('no-existe')).rejects.toBeInstanceOf(NotFoundException);
      expect(authRepo.setPlatformAdmin).not.toHaveBeenCalled();
    });
  });

  describe('list', () => {
    it('delega en el repositorio', async () => {
      const admins = [buildUsuario({ isPlatformAdmin: true })];
      authRepo.listarAdministradoresPlataforma.mockResolvedValue(admins);

      const result = await service.list();

      expect(result).toBe(admins);
    });
  });
});
