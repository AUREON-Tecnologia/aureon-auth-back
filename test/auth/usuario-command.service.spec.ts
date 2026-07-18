import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { UsuarioCommandService } from '../../src/modules/auth/application/commands/usuario-command.service';
import {
  AUTH_REPOSITORY,
  IAuthRepository,
} from '../../src/modules/auth/domain/repositories/auth.repository.interface';
import { Usuario } from '../../src/modules/auth/domain/entities/usuario.entity';
import { UsuarioRol } from '../../src/modules/auth/domain/entities/usuario-rol.entity';
import { AuditLogService } from '../../src/common/services/audit-log.service';

const buildUsuario = (overrides: Partial<Usuario> = {}): Usuario =>
  new Usuario(
    overrides.id ?? 'usr-1',
    overrides.numeroIdentificacion ?? '1234567890',
    overrides.idTipoNumeroIdentificacion ?? 'tipo-cc',
    overrides.email ?? 'u@taller.com',
    overrides.telefono ?? '+573001234567',
    overrides.idUsuarioRol ?? 'rol-admin',
    overrides.activo ?? true,
    overrides.intentosFallidos ?? 0,
    overrides.bloqueadoHasta ?? null,
    overrides.ultimoAcceso ?? null,
    overrides.fechaCreacion ?? new Date(),
    overrides.rol ?? new UsuarioRol('rol-admin', 'administrador', 10),
  );

describe('UsuarioCommandService', () => {
  let service: UsuarioCommandService;
  let repo: jest.Mocked<IAuthRepository>;
  let auditLog: jest.Mocked<AuditLogService>;

  beforeEach(async () => {
    const repoMock: jest.Mocked<IAuthRepository> = {
      findById: jest.fn(),
      findByEmail: jest.fn(),
      findByEmailWithPassword: jest.fn(),
      findByNumeroIdentificacion: jest.fn(),
      findAll: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      registrarLoginExitoso: jest.fn(),
      registrarIntentoFallido: jest.fn(),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        UsuarioCommandService,
        { provide: AUTH_REPOSITORY, useValue: repoMock },
        { provide: AuditLogService, useValue: { registrar: jest.fn() } },
      ],
    }).compile();

    service = moduleRef.get(UsuarioCommandService);
    repo = moduleRef.get(AUTH_REPOSITORY);
    auditLog = moduleRef.get(AuditLogService);
  });

  describe('actualizar', () => {
    it('actualiza el usuario existente y audita el cambio con el actor', async () => {
      const existente = buildUsuario();
      const actualizado = buildUsuario({ telefono: '+573009999999' });
      repo.findById.mockResolvedValue(existente);
      repo.update.mockResolvedValue(actualizado);

      const result = await service.actualizar('usr-1', { telefono: '+573009999999' }, 'admin-1');

      expect(repo.update).toHaveBeenCalledWith('usr-1', { telefono: '+573009999999' });
      expect(result.telefono).toBe('+573009999999');
      expect(auditLog.registrar).toHaveBeenCalledWith(
        expect.objectContaining({ evento: 'USUARIO_ACTUALIZADO', usuarioId: 'usr-1', actorId: 'admin-1' }),
      );
    });

    it('lanza NotFoundException si el usuario no existe', async () => {
      repo.findById.mockResolvedValue(null);
      await expect(service.actualizar('no-existe', {}, 'admin-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(repo.update).not.toHaveBeenCalled();
    });
  });

  describe('desactivar', () => {
    it('marca activo=false (baja logica) y audita', async () => {
      const existente = buildUsuario({ activo: true });
      const desactivado = buildUsuario({ activo: false });
      repo.findById.mockResolvedValue(existente);
      repo.update.mockResolvedValue(desactivado);

      const result = await service.desactivar('usr-1', 'admin-1');

      expect(repo.update).toHaveBeenCalledWith('usr-1', { activo: false });
      expect(result.activo).toBe(false);
      expect(auditLog.registrar).toHaveBeenCalledWith(
        expect.objectContaining({ evento: 'USUARIO_DESACTIVADO', usuarioId: 'usr-1' }),
      );
    });

    it('es idempotente: desactivar un usuario ya inactivo no llama a update', async () => {
      const yaInactivo = buildUsuario({ activo: false });
      repo.findById.mockResolvedValue(yaInactivo);

      const result = await service.desactivar('usr-1', 'admin-1');

      expect(repo.update).not.toHaveBeenCalled();
      expect(result.activo).toBe(false);
    });

    it('lanza NotFoundException si el usuario no existe', async () => {
      repo.findById.mockResolvedValue(null);
      await expect(service.desactivar('no-existe', 'admin-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
