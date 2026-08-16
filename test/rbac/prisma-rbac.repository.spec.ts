import { PrismaRbacRepository } from '../../src/modules/rbac/infrastructure/repositories/prisma-rbac.repository';
import { PrismaService } from '../../src/common/prisma/prisma.service';

type PrismaMock = {
  userTenantMembership: { findUnique: jest.Mock };
  userPermission: { findMany: jest.Mock };
  tenantModule: { findMany: jest.Mock };
};

const buildPrisma = (): PrismaMock => ({
  userTenantMembership: { findUnique: jest.fn() },
  userPermission: { findMany: jest.fn() },
  tenantModule: { findMany: jest.fn() },
});

describe('PrismaRbacRepository.permisosEfectivos', () => {
  let prisma: PrismaMock;
  let repository: PrismaRbacRepository;

  beforeEach(() => {
    prisma = buildPrisma();
    repository = new PrismaRbacRepository(prisma as unknown as PrismaService);
  });

  it('returns the permissions of the active membership role', async () => {
    prisma.userTenantMembership.findUnique.mockResolvedValue({
      isActive: true,
      role: {
        rolePermissions: [
          { permission: { code: 'clientes:listar' } },
          { permission: { code: 'clientes:crear' } },
        ],
      },
    });
    prisma.userPermission.findMany.mockResolvedValue([]);

    const permissions = await repository.permisosEfectivos('usr-1', 'tenant-1');

    expect(permissions.sort()).toEqual(['clientes:crear', 'clientes:listar']);
  });

  it('ignores role permissions when the membership is not active', async () => {
    prisma.userTenantMembership.findUnique.mockResolvedValue({
      isActive: false,
      role: { rolePermissions: [{ permission: { code: 'clientes:listar' } }] },
    });
    prisma.userPermission.findMany.mockResolvedValue([]);

    const permissions = await repository.permisosEfectivos('usr-1', 'tenant-1');

    expect(permissions).toEqual([]);
  });

  it('adds an ALLOW override that is not granted by the role', async () => {
    prisma.userTenantMembership.findUnique.mockResolvedValue({
      isActive: true,
      role: { rolePermissions: [] },
    });
    prisma.userPermission.findMany.mockResolvedValue([
      { effect: 'ALLOW', permission: { code: 'permissions:assign-direct' } },
    ]);

    const permissions = await repository.permisosEfectivos('usr-1', 'tenant-1');

    expect(permissions).toEqual(['permissions:assign-direct']);
  });

  it('removes a DENY override on a permission that is granted by the role', async () => {
    prisma.userTenantMembership.findUnique.mockResolvedValue({
      isActive: true,
      role: {
        rolePermissions: [
          { permission: { code: 'clientes:listar' } },
          { permission: { code: 'clientes:eliminar' } },
        ],
      },
    });
    prisma.userPermission.findMany.mockResolvedValue([
      { effect: 'DENY', permission: { code: 'clientes:eliminar' } },
    ]);

    const permissions = await repository.permisosEfectivos('usr-1', 'tenant-1');

    expect(permissions).toEqual(['clientes:listar']);
  });

  it('with no membership, only direct overrides count', async () => {
    prisma.userTenantMembership.findUnique.mockResolvedValue(null);
    prisma.userPermission.findMany.mockResolvedValue([
      { effect: 'ALLOW', permission: { code: 'modules:list' } },
    ]);

    const permissions = await repository.permisosEfectivos('usr-1', 'tenant-1');

    expect(permissions).toEqual(['modules:list']);
  });

  it('filters overrides by expiresAt null or in the future', async () => {
    prisma.userTenantMembership.findUnique.mockResolvedValue({
      isActive: true,
      role: { rolePermissions: [] },
    });
    prisma.userPermission.findMany.mockResolvedValue([]);

    await repository.permisosEfectivos('usr-1', 'tenant-1');

    expect(prisma.userPermission.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: 'usr-1',
          tenantId: 'tenant-1',
          OR: [{ expiresAt: null }, { expiresAt: { gt: expect.any(Date) } }],
        }),
      }),
    );
  });

  it('only queries role permissions whose module is active for this tenant', async () => {
    prisma.userTenantMembership.findUnique.mockResolvedValue({
      isActive: true,
      role: { rolePermissions: [] },
    });
    prisma.userPermission.findMany.mockResolvedValue([]);

    await repository.permisosEfectivos('usr-1', 'tenant-1');

    expect(prisma.userTenantMembership.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          role: expect.objectContaining({
            select: expect.objectContaining({
              rolePermissions: expect.objectContaining({
                where: {
                  permission: {
                    isActive: true,
                    module: { tenantModules: { some: { tenantId: 'tenant-1', isActive: true } } },
                  },
                },
              }),
            }),
          }),
        }),
      }),
    );
  });

  it('only counts direct overrides whose module is active for this tenant', async () => {
    prisma.userTenantMembership.findUnique.mockResolvedValue(null);
    prisma.userPermission.findMany.mockResolvedValue([]);

    await repository.permisosEfectivos('usr-1', 'tenant-1');

    expect(prisma.userPermission.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          permission: { module: { tenantModules: { some: { tenantId: 'tenant-1', isActive: true } } } },
        }),
      }),
    );
  });
});

describe('PrismaRbacRepository.listActiveModulesForTenant', () => {
  let prisma: PrismaMock;
  let repository: PrismaRbacRepository;

  beforeEach(() => {
    prisma = buildPrisma();
    repository = new PrismaRbacRepository(prisma as unknown as PrismaService);
  });

  it('returns the codes of the modules active for the tenant', async () => {
    prisma.tenantModule.findMany.mockResolvedValue([
      { module: { code: 'clientes' } },
      { module: { code: 'rbac-core' } },
    ]);

    const codes = await repository.listActiveModulesForTenant('tenant-1');

    expect(codes).toEqual(['clientes', 'rbac-core']);
    expect(prisma.tenantModule.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: 'tenant-1', isActive: true } }),
    );
  });

  it('returns an empty array if the tenant has no active modules', async () => {
    prisma.tenantModule.findMany.mockResolvedValue([]);

    const codes = await repository.listActiveModulesForTenant('tenant-1');

    expect(codes).toEqual([]);
  });
});
