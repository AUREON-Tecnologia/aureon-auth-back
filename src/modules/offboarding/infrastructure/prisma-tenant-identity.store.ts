import { Inject, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type Redis from 'ioredis';
import { ACCESS_TOKEN_SESSION_NAMESPACE, REDIS_CLIENT } from '@aureon/redis-client';
import { PrismaService } from '../../../common/prisma/prisma.service';
import type { ServiceExport, ServiceStats, StatMetric } from '../domain/tenant-data-source.port';
import type { ITenantIdentityStore } from '../domain/tenant-identity.port';

const SERVICE = 'identity';
const SCAN_BATCH = 500;

@Injectable()
export class PrismaTenantIdentityStore implements ITenantIdentityStore {
  private readonly logger = new Logger(PrismaTenantIdentityStore.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis | null,
  ) {}

  async setActive(tenantId: string, active: boolean): Promise<void> {
    await this.prisma.tenant.update({ where: { id: tenantId }, data: { isActive: active } });
  }

  /**
   * Refresh tokens live in Postgres. Access tokens are a Redis whitelist keyed by jti with the JWT payload as value,
   * with no per-tenant index: the namespace is scanned and the tenant's entries deleted. Without Redis the access
   * tokens simply expire (JWT_EXPIRES_IN); refresh is already blocked by the inactive tenant.
   */
  async revokeSessions(tenantId: string): Promise<{ refreshTokens: number; accessTokens: number }> {
    const { count: refreshTokens } = await this.prisma.userSession.updateMany({
      where: { tenantId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    let accessTokens = 0;
    if (!this.redis) {
      this.logger.warn(
        `Redis not configured: access tokens of tenant ${tenantId} will expire on their own`,
      );
      return { refreshTokens, accessTokens };
    }
    let cursor = '0';
    do {
      const [next, keys] = await this.redis.scan(
        cursor,
        'MATCH',
        `${ACCESS_TOKEN_SESSION_NAMESPACE}:*`,
        'COUNT',
        SCAN_BATCH,
      );
      cursor = next;
      if (keys.length === 0) continue;
      const values = await this.redis.mget(...keys);
      const doomed = keys.filter((_, i) => belongsTo(values[i], tenantId));
      if (doomed.length > 0) accessTokens += await this.redis.del(...doomed);
    } while (cursor !== '0');
    return { refreshTokens, accessTokens };
  }

  async getStats(tenantId: string): Promise<ServiceStats> {
    const [activeMembers, roles, modules, joined] = await Promise.all([
      this.prisma.userTenantMembership.count({ where: { tenantId, isActive: true } }),
      this.prisma.role.count({ where: { tenantId } }),
      this.prisma.tenantModule.findMany({
        where: { tenantId, isActive: true },
        select: { module: { select: { code: true } } },
      }),
      this.prisma.$queryRaw<{ month: string; value: bigint }[]>`
        SELECT to_char(date_trunc('month', joined_at), 'YYYY-MM') AS month, count(*) AS value
        FROM app_auth.user_tenant_memberships
        WHERE tenant_id = ${tenantId}::uuid
        GROUP BY 1 ORDER BY 1`,
    ]);
    const metrics: StatMetric[] = [
      { metric: 'identity.active_members', month: null, value: activeMembers },
      { metric: 'identity.roles', month: null, value: roles },
      ...modules.map((m) => ({
        metric: `identity.module.${m.module.code}`,
        month: null,
        value: 1,
      })),
      ...joined.map((r) => ({
        metric: 'identity.members_joined',
        month: r.month,
        value: Number(r.value),
      })),
    ];
    return { service: SERVICE, metrics };
  }

  async getExport(tenantId: string): Promise<ServiceExport> {
    const [tenant, roles, memberships, modules] = await Promise.all([
      this.prisma.tenant.findUnique({
        where: { id: tenantId },
        select: {
          id: true,
          code: true,
          name: true,
          isActive: true,
          settings: true,
          createdAt: true,
        },
      }),
      this.prisma.role.findMany({
        where: { tenantId },
        select: {
          id: true,
          code: true,
          name: true,
          description: true,
          isActive: true,
          isSystem: true,
        },
      }),
      this.prisma.userTenantMembership.findMany({
        where: { tenantId },
        select: {
          id: true,
          userId: true,
          roleId: true,
          isActive: true,
          joinedAt: true,
          // Name and email only: never password hashes, sessions or tokens.
          user: { select: { email: true, firstName: true, lastName: true, isActive: true } },
        },
      }),
      this.prisma.tenantModule.findMany({
        where: { tenantId },
        select: {
          isActive: true,
          activatedAt: true,
          module: { select: { code: true, name: true } },
        },
      }),
    ]);
    return {
      service: SERVICE,
      tables: {
        'app_auth.tenants': tenant ? [tenant] : [],
        'app_auth.roles': roles,
        'app_auth.user_tenant_memberships': memberships,
        'app_auth.tenant_modules': modules,
      },
      files: [],
    };
  }

  async findTenantOnlyUsers(tenantId: string): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT u.id
      FROM app_auth.users u
      JOIN app_auth.user_tenant_memberships m ON m.user_id = u.id AND m.tenant_id = ${tenantId}::uuid
      WHERE u.is_platform_admin = false
        AND NOT EXISTS (
          SELECT 1 FROM app_auth.user_tenant_memberships o
          WHERE o.user_id = u.id AND o.tenant_id <> ${tenantId}::uuid
        )`;
    return rows.map((r) => r.id);
  }

  async deleteTenant(tenantId: string): Promise<boolean> {
    const { count } = await this.prisma.tenant.deleteMany({ where: { id: tenantId } });
    return count > 0;
  }

  async removeUsers(userIds: string[]): Promise<{ deleted: number; anonymized: number }> {
    let deleted = 0;
    let anonymized = 0;
    for (const id of userIds) {
      try {
        const { count } = await this.prisma.user.deleteMany({ where: { id } });
        deleted += count;
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2003')
          throw error;
        // Still referenced (FK): keep the row but strip everything that identifies a person.
        await this.prisma.user.update({
          where: { id },
          data: {
            email: `deleted-${id}@invalid.aureon`,
            firstName: null,
            lastName: null,
            passwordHash: null,
            isActive: false,
            deletedAt: new Date(),
          },
        });
        await this.prisma.userSession.deleteMany({ where: { userId: id } });
        anonymized++;
      }
    }
    return { deleted, anonymized };
  }
}

function belongsTo(value: string | null, tenantId: string): boolean {
  if (!value) return false;
  try {
    return (JSON.parse(value) as { tenantId?: string }).tenantId === tenantId;
  } catch {
    return false;
  }
}
