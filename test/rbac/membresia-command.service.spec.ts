import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { MembresiaCommandService } from '../../src/modules/rbac/application/commands/membresia-command.service';
import { IRbacRepository, RBAC_REPOSITORY } from '../../src/modules/rbac/domain/repositories/rbac.repository.interface';
import { Membresia } from '../../src/modules/rbac/domain/entities/membresia.entity';
import { Rol } from '../../src/modules/rbac/domain/entities/rol.entity';
import { AuditLogService } from '../../src/common/services/audit-log.service';
import { buildRbacRepositoryMock } from './__helpers__/rbac-repository.mock';

const TENANT_ID = 'tenant-uuid-1';

const ROL_ADMINISTRADOR = new Rol('rol-1', TENANT_ID, 'administrador', 'Administrador', null, true, true);

const buildMembresia = (overrides: Partial<Membresia> = {}): Membresia =>
  new Membresia(
    overrides.id ?? 'membresia-1',
    overrides.userId ?? 'usr-1',
    overrides.tenantId ?? TENANT_ID,
    overrides.rolId ?? 'rol-1',
    overrides.activo ?? true,
    overrides.fechaIngreso ?? new Date(),
    overrides.fechaExpiracion ?? null,
    overrides.rol,
  );

describe('MembresiaCommandService', () => {
  let service: MembresiaCommandService;
  let repo: jest.Mocked<IRbacRepository>;
  let auditLog: jest.Mocked<AuditLogService>;

  beforeEach(async () => {
    const repoMock = buildRbacRepositoryMock();

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        MembresiaCommandService,
        { provide: RBAC_REPOSITORY, useValue: repoMock },
        { provide: AuditLogService, useValue: { registrar: jest.fn() } },
      ],
    }).compile();

    service = moduleRef.get(MembresiaCommandService);
    repo = moduleRef.get(RBAC_REPOSITORY);
    auditLog = moduleRef.get(AuditLogService);
  });

  describe('actualizar', () => {
    it('actualiza la membresia existente y audita con el actor', async () => {
      const existente = buildMembresia();
      const actualizada = buildMembresia({ rolId: 'rol-2' });
      repo.buscarMembresiaPorId.mockResolvedValue(existente);
      repo.actualizarMembresia.mockResolvedValue(actualizada);

      const result = await service.actualizar('membresia-1', TENANT_ID, { rolId: 'rol-2' }, 'admin-1');

      expect(repo.actualizarMembresia).toHaveBeenCalledWith('membresia-1', { rolId: 'rol-2' });
      expect(result.rolId).toBe('rol-2');
      expect(auditLog.registrar).toHaveBeenCalledWith(
        expect.objectContaining({ evento: 'MEMBRESIA_ACTUALIZADA', tenantId: TENANT_ID, actorId: 'admin-1' }),
      );
    });

    it('lanza NotFoundException si la membresia no existe en ese tenant', async () => {
      repo.buscarMembresiaPorId.mockResolvedValue(null);
      await expect(service.actualizar('no-existe', TENANT_ID, {}, 'admin-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('bloquea cambiar de rol al ultimo administrador activo del tenant', async () => {
      repo.buscarMembresiaPorId.mockResolvedValue(buildMembresia({ rol: ROL_ADMINISTRADOR }));
      repo.contarMembresiasActivasPorRolCodigo.mockResolvedValue(1);

      await expect(service.actualizar('membresia-1', TENANT_ID, { rolId: 'rol-2' }, 'admin-1')).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(repo.actualizarMembresia).not.toHaveBeenCalled();
    });

    it('permite cambiar de rol si hay mas de un administrador activo', async () => {
      const existente = buildMembresia({ rol: ROL_ADMINISTRADOR });
      repo.buscarMembresiaPorId.mockResolvedValue(existente);
      repo.contarMembresiasActivasPorRolCodigo.mockResolvedValue(2);
      repo.actualizarMembresia.mockResolvedValue(buildMembresia({ rolId: 'rol-2' }));

      await service.actualizar('membresia-1', TENANT_ID, { rolId: 'rol-2' }, 'admin-1');

      expect(repo.actualizarMembresia).toHaveBeenCalledWith('membresia-1', { rolId: 'rol-2' });
    });

    it('no consulta el conteo de administradores si el rol no cambia', async () => {
      const existente = buildMembresia({ rol: ROL_ADMINISTRADOR });
      repo.buscarMembresiaPorId.mockResolvedValue(existente);
      repo.actualizarMembresia.mockResolvedValue(existente);

      await service.actualizar('membresia-1', TENANT_ID, { rolId: 'rol-1' }, 'admin-1');

      expect(repo.contarMembresiasActivasPorRolCodigo).not.toHaveBeenCalled();
    });
  });

  describe('desactivar', () => {
    it('marca activo=false (baja logica de la membresia, no del usuario global)', async () => {
      const existente = buildMembresia({ activo: true });
      const desactivada = buildMembresia({ activo: false });
      repo.buscarMembresiaPorId.mockResolvedValue(existente);
      repo.actualizarMembresia.mockResolvedValue(desactivada);

      const result = await service.desactivar('membresia-1', TENANT_ID, 'admin-1');

      expect(repo.actualizarMembresia).toHaveBeenCalledWith('membresia-1', { activo: false });
      expect(result.activo).toBe(false);
    });

    it('es idempotente: desactivar una membresia ya inactiva no llama a actualizarMembresia', async () => {
      repo.buscarMembresiaPorId.mockResolvedValue(buildMembresia({ activo: false }));
      const result = await service.desactivar('membresia-1', TENANT_ID, 'admin-1');
      expect(repo.actualizarMembresia).not.toHaveBeenCalled();
      expect(result.activo).toBe(false);
    });

    it('bloquea desactivar al ultimo administrador activo del tenant', async () => {
      repo.buscarMembresiaPorId.mockResolvedValue(buildMembresia({ activo: true, rol: ROL_ADMINISTRADOR }));
      repo.contarMembresiasActivasPorRolCodigo.mockResolvedValue(1);

      await expect(service.desactivar('membresia-1', TENANT_ID, 'admin-1')).rejects.toBeInstanceOf(ConflictException);
      expect(repo.actualizarMembresia).not.toHaveBeenCalled();
    });

    it('permite desactivar a un administrador si hay mas de uno activo', async () => {
      repo.buscarMembresiaPorId.mockResolvedValue(buildMembresia({ activo: true, rol: ROL_ADMINISTRADOR }));
      repo.contarMembresiasActivasPorRolCodigo.mockResolvedValue(2);
      repo.actualizarMembresia.mockResolvedValue(buildMembresia({ activo: false, rol: ROL_ADMINISTRADOR }));

      const result = await service.desactivar('membresia-1', TENANT_ID, 'admin-1');

      expect(result.activo).toBe(false);
    });
  });
});
