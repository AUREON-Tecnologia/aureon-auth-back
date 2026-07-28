import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { MembresiaCommandService } from '../../src/modules/rbac/application/commands/membresia-command.service';
import { IRbacRepository, RBAC_REPOSITORY } from '../../src/modules/rbac/domain/repositories/rbac.repository.interface';
import { Membresia } from '../../src/modules/rbac/domain/entities/membresia.entity';
import { AuditLogService } from '../../src/common/services/audit-log.service';

const TENANT_ID = 'tenant-uuid-1';

const buildMembresia = (overrides: Partial<Membresia> = {}): Membresia =>
  new Membresia(
    overrides.id ?? 'membresia-1',
    overrides.userId ?? 'usr-1',
    overrides.tenantId ?? TENANT_ID,
    overrides.rolId ?? 'rol-1',
    overrides.activo ?? true,
    overrides.fechaIngreso ?? new Date(),
    overrides.fechaExpiracion ?? null,
  );

describe('MembresiaCommandService', () => {
  let service: MembresiaCommandService;
  let repo: jest.Mocked<IRbacRepository>;
  let auditLog: jest.Mocked<AuditLogService>;

  beforeEach(async () => {
    const repoMock: jest.Mocked<IRbacRepository> = {
      crearRol: jest.fn(),
      buscarRolPorCodigo: jest.fn(),
      listarRoles: jest.fn(),
      crearPermiso: jest.fn(),
      listarPermisos: jest.fn(),
      asignarPermisoARol: jest.fn(),
      crearMembresia: jest.fn(),
      buscarMembresia: jest.fn(),
      buscarMembresiaPorId: jest.fn(),
      listarMembresias: jest.fn(),
      actualizarMembresia: jest.fn(),
      asignarPermisoDirecto: jest.fn(),
      quitarPermisoDirecto: jest.fn(),
      permisosEfectivos: jest.fn(),
      tienePermisoEfectivo: jest.fn(),
    };

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
  });
});
