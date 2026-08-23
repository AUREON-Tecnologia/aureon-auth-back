import { Injectable } from '@nestjs/common';
import { Prisma, Role as RoleRow, Module as ModuleRow, Permission as PermissionRow } from '@prisma/client';
import { PrismaService } from '../../../../common/prisma/prisma.service';
import { Paginacion } from '../../../../common/domain/paginacion-meta';
import {
  ActualizarMembresiaData,
  AsignarPermisoDirectoData,
  CrearMembresiaData,
  CrearModuloData,
  CrearPermisoData,
  CrearRolData,
  FiltrosMembresia,
  IRbacRepository,
} from '../../domain/repositories/rbac.repository.interface';
import { Rol } from '../../domain/entities/rol.entity';
import { Permiso } from '../../domain/entities/permiso.entity';
import { Modulo } from '../../domain/entities/modulo.entity';
import { TenantModulo } from '../../domain/entities/tenant-modulo.entity';
import { Membresia, UsuarioResumen } from '../../domain/entities/membresia.entity';

const membresiaInclude = {
  role: true,
  user: { select: { id: true, email: true, firstName: true, lastName: true } },
} satisfies Prisma.UserTenantMembershipInclude;

type MembresiaRow = Prisma.UserTenantMembershipGetPayload<{ include: typeof membresiaInclude }>;

@Injectable()
export class PrismaRbacRepository implements IRbacRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ---- modulos ----

  async crearModulo(data: CrearModuloData): Promise<Modulo> {
    const row = await this.prisma.module.create({
      data: { code: data.codigo, name: data.nombre, description: data.descripcion ?? null },
    });
    return this.toModulo(row);
  }

  async buscarModuloPorCodigo(codigo: string): Promise<Modulo | null> {
    const row = await this.prisma.module.findUnique({ where: { code: codigo } });
    return row ? this.toModulo(row) : null;
  }

  async listarModulos(): Promise<Modulo[]> {
    const rows = await this.prisma.module.findMany({ orderBy: { code: 'asc' } });
    return rows.map((r) => this.toModulo(r));
  }

  // ---- tenant_modules ----

  async activarModuloParaTenant(tenantId: string, moduloId: string): Promise<TenantModulo> {
    const row = await this.prisma.tenantModule.upsert({
      where: { tenantId_moduleId: { tenantId, moduleId: moduloId } },
      update: { isActive: true, expiresAt: null },
      create: { tenantId, moduleId: moduloId },
      include: { module: true },
    });
    return this.toTenantModulo(row);
  }

  async desactivarModuloParaTenant(tenantId: string, moduloId: string): Promise<void> {
    await this.prisma.tenantModule.update({
      where: { tenantId_moduleId: { tenantId, moduleId: moduloId } },
      data: { isActive: false },
    });
  }

  async listarModulosDeTenant(tenantId: string): Promise<TenantModulo[]> {
    const rows = await this.prisma.tenantModule.findMany({
      where: { tenantId },
      include: { module: true },
    });
    return rows.map((r) => this.toTenantModulo(r));
  }

  async listActiveModulesForTenant(tenantId: string): Promise<string[]> {
    const rows = await this.prisma.tenantModule.findMany({
      where: { tenantId, isActive: true },
      select: { module: { select: { code: true } } },
    });
    return rows.map((r) => r.module.code);
  }

  // ---- permisos ----

  async crearPermiso(data: CrearPermisoData): Promise<Permiso> {
    const row = await this.prisma.permission.create({
      data: { moduleId: data.moduloId, code: data.codigo, name: data.nombre },
    });
    return this.toPermiso(row);
  }

  async buscarPermisoPorCodigo(codigo: string): Promise<Permiso | null> {
    const row = await this.prisma.permission.findUnique({ where: { code: codigo } });
    return row ? this.toPermiso(row) : null;
  }

  async listarPermisos(): Promise<Permiso[]> {
    const rows = await this.prisma.permission.findMany({ orderBy: { code: 'asc' } });
    return rows.map((r) => this.toPermiso(r));
  }

  async getModuleCodesByPermission(): Promise<Record<string, string>> {
    const rows = await this.prisma.permission.findMany({
      select: { code: true, module: { select: { code: true } } },
    });
    return Object.fromEntries(rows.map((r) => [r.code, r.module.code]));
  }

  async asignarPermisoARol(rolId: string, permisoId: string, otorgadoPor?: string | null): Promise<void> {
    await this.prisma.rolePermission.create({
      data: { roleId: rolId, permissionId: permisoId, grantedBy: otorgadoPor ?? null },
    });
  }

  // ---- roles ----

  async crearRol(data: CrearRolData): Promise<Rol> {
    const row = await this.prisma.role.create({
      data: {
        tenantId: data.tenantId,
        code: data.codigo,
        name: data.nombre,
        description: data.descripcion ?? null,
        isSystem: data.esSistema ?? false,
      },
    });
    return this.toRol(row);
  }

  async buscarRolPorCodigo(tenantId: string, codigo: string): Promise<Rol | null> {
    const row = await this.prisma.role.findUnique({ where: { tenantId_code: { tenantId, code: codigo } } });
    return row ? this.toRol(row) : null;
  }

  async listarRoles(tenantId: string): Promise<Rol[]> {
    const rows = await this.prisma.role.findMany({ where: { tenantId } });
    return rows.map((r) => this.toRol(r));
  }

  // ---- memberships ----

  async crearMembresia(data: CrearMembresiaData): Promise<Membresia> {
    const row = await this.prisma.userTenantMembership.create({
      data: {
        userId: data.userId,
        tenantId: data.tenantId,
        roleId: data.rolId,
        invitedBy: data.invitadoPor ?? null,
      },
      include: membresiaInclude,
    });
    return this.toMembresia(row);
  }

  async buscarMembresia(userId: string, tenantId: string): Promise<Membresia | null> {
    const row = await this.prisma.userTenantMembership.findUnique({
      where: { userId_tenantId: { userId, tenantId } },
      include: membresiaInclude,
    });
    return row ? this.toMembresia(row) : null;
  }

  async buscarMembresiaPorId(id: string, tenantId: string): Promise<Membresia | null> {
    const row = await this.prisma.userTenantMembership.findFirst({
      where: { id, tenantId },
      include: membresiaInclude,
    });
    return row ? this.toMembresia(row) : null;
  }

  async listarMembresias(
    tenantId: string,
    filtros: FiltrosMembresia,
    paginacion: Paginacion,
  ): Promise<{ data: Membresia[]; total: number }> {
    const where: Prisma.UserTenantMembershipWhereInput = {
      tenantId,
      ...(filtros.activo !== undefined ? { isActive: filtros.activo } : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.userTenantMembership.findMany({
        where,
        include: membresiaInclude,
        orderBy: { joinedAt: 'desc' },
        skip: (paginacion.pagina - 1) * paginacion.tamanioPagina,
        take: paginacion.tamanioPagina,
      }),
      this.prisma.userTenantMembership.count({ where }),
    ]);

    return { data: rows.map((r) => this.toMembresia(r)), total };
  }

  async listarMembresiasActivasDeUsuario(userId: string): Promise<Membresia[]> {
    const rows = await this.prisma.userTenantMembership.findMany({
      where: { userId, isActive: true },
      include: membresiaInclude,
      orderBy: { joinedAt: 'asc' },
    });
    return rows.map((r) => this.toMembresia(r));
  }

  async actualizarMembresia(id: string, data: ActualizarMembresiaData): Promise<Membresia> {
    const row = await this.prisma.userTenantMembership.update({
      where: { id },
      data: {
        ...(data.rolId !== undefined ? { roleId: data.rolId } : {}),
        ...(data.activo !== undefined ? { isActive: data.activo } : {}),
      },
      include: membresiaInclude,
    });
    return this.toMembresia(row);
  }

  // ---- permisos directos ----

  async asignarPermisoDirecto(data: AsignarPermisoDirectoData): Promise<void> {
    await this.prisma.userPermission.upsert({
      where: {
        userId_tenantId_permissionId: {
          userId: data.userId,
          tenantId: data.tenantId,
          permissionId: data.permisoId,
        },
      },
      update: {
        effect: data.effect,
        grantedBy: data.otorgadoPor ?? null,
        expiresAt: data.expiraEn ?? null,
        reason: data.razon ?? null,
      },
      create: {
        userId: data.userId,
        tenantId: data.tenantId,
        permissionId: data.permisoId,
        effect: data.effect,
        grantedBy: data.otorgadoPor ?? null,
        expiresAt: data.expiraEn ?? null,
        reason: data.razon ?? null,
      },
    });
  }

  async quitarPermisoDirecto(userId: string, tenantId: string, permisoId: string): Promise<void> {
    await this.prisma.userPermission.delete({
      where: { userId_tenantId_permissionId: { userId, tenantId, permissionId: permisoId } },
    });
  }

  // ---- permisos efectivos ----

  /**
   * Replaces the `auth.v_user_effective_permissions` view (written against
   * an old schema where `permissions` was per-tenant) with native Prisma
   * queries against the current global schema: permissions from the active
   * membership's role, plus direct overrides ALLOW (add) / DENY (remove),
   * ignoring already-expired overrides.
   *
   * Both the role-derived permissions and the direct overrides are also
   * filtered by the owning module being active for this tenant
   * (`tenant_modules.is_active`) — a permission whose module was
   * deactivated stops being effective on the user's next login/refresh,
   * even if the role (or a direct ALLOW override) still grants it.
   */
  async permisosEfectivos(userId: string, tenantId: string): Promise<string[]> {
    const moduleActiveForTenant = {
      module: { tenantModules: { some: { tenantId, isActive: true } } },
    };

    const membership = await this.prisma.userTenantMembership.findUnique({
      where: { userId_tenantId: { userId, tenantId } },
      select: {
        isActive: true,
        role: {
          select: {
            rolePermissions: {
              where: { permission: { isActive: true, ...moduleActiveForTenant } },
              select: { permission: { select: { code: true } } },
            },
          },
        },
      },
    });

    const effectivePermissions = new Set<string>(
      membership?.isActive
        ? membership.role.rolePermissions.map((rp) => rp.permission.code)
        : [],
    );

    const overrides = await this.prisma.userPermission.findMany({
      where: {
        userId,
        tenantId,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        permission: moduleActiveForTenant,
      },
      select: { effect: true, permission: { select: { code: true } } },
    });

    for (const override of overrides) {
      if (override.effect === 'ALLOW') {
        effectivePermissions.add(override.permission.code);
      } else if (override.effect === 'DENY') {
        effectivePermissions.delete(override.permission.code);
      }
    }

    return [...effectivePermissions];
  }

  async tienePermisoEfectivo(userId: string, tenantId: string, codigoPermiso: string): Promise<boolean> {
    const permisos = await this.permisosEfectivos(userId, tenantId);
    return permisos.includes(codigoPermiso);
  }

  // ---- mapeo Prisma -> dominio ----

  private toModulo(row: ModuleRow): Modulo {
    return new Modulo(row.id, row.code, row.name, row.description, row.isActive);
  }

  private toPermiso(row: PermissionRow): Permiso {
    return new Permiso(row.id, row.moduleId, row.code, row.name, row.isActive);
  }

  private toRol(row: RoleRow): Rol {
    return new Rol(row.id, row.tenantId, row.code, row.name, row.description, row.isActive, row.isSystem);
  }

  private toTenantModulo(row: Prisma.TenantModuleGetPayload<{ include: { module: true } }>): TenantModulo {
    return new TenantModulo(
      row.tenantId,
      row.moduleId,
      row.isActive,
      row.activatedAt,
      row.expiresAt,
      this.toModulo(row.module),
    );
  }

  private toMembresia(row: MembresiaRow): Membresia {
    const usuario: UsuarioResumen | undefined = row.user
      ? { id: row.user.id, email: row.user.email, primerNombre: row.user.firstName, apellido: row.user.lastName }
      : undefined;

    return new Membresia(
      row.id,
      row.userId,
      row.tenantId,
      row.roleId,
      row.isActive,
      row.joinedAt,
      row.expiresAt,
      row.role ? this.toRol(row.role) : undefined,
      usuario,
    );
  }
}
