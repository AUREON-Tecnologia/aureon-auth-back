import { Injectable } from '@nestjs/common';
import { Prisma, TenantOffboarding as Row } from '@prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';
import {
  ExportEntry,
  OffboardingStatus,
  PurgeStep,
  TenantOffboardingRecord,
} from '../domain/tenant-offboarding';
import type {
  CreateOffboardingData,
  ITenantOffboardingRepository,
  OffboardingPatch,
} from '../domain/tenant-offboarding.repository';

@Injectable()
export class PrismaTenantOffboardingRepository implements ITenantOffboardingRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findOpen(tenantId: string): Promise<TenantOffboardingRecord | null> {
    const row = await this.prisma.tenantOffboarding.findFirst({
      where: { tenantId, status: 'TERMINATED' },
    });
    return row ? toRecord(row) : null;
  }

  async findLatest(tenantId: string): Promise<TenantOffboardingRecord | null> {
    const row = await this.prisma.tenantOffboarding.findFirst({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
    return row ? toRecord(row) : null;
  }

  async create(data: CreateOffboardingData): Promise<TenantOffboardingRecord> {
    return toRecord(
      await this.prisma.tenantOffboarding.create({ data: { ...data, status: 'TERMINATED' } }),
    );
  }

  async update(id: string, patch: OffboardingPatch): Promise<TenantOffboardingRecord> {
    const { exports, stats, orphanUserIds, deletedCounts, ...rest } = patch;
    return toRecord(
      await this.prisma.tenantOffboarding.update({
        where: { id },
        data: {
          ...rest,
          ...(exports !== undefined && { exports: exports as unknown as Prisma.InputJsonValue }),
          ...(stats !== undefined && { stats: json(stats) }),
          ...(orphanUserIds !== undefined && { orphanUserIds: json(orphanUserIds) }),
          ...(deletedCounts !== undefined && { deletedCounts: json(deletedCounts) }),
        },
      }),
    );
  }
}

function json(value: unknown): Prisma.InputJsonValue | typeof Prisma.DbNull {
  return value === null ? Prisma.DbNull : (value as Prisma.InputJsonValue);
}

function toRecord(row: Row): TenantOffboardingRecord {
  return {
    id: row.id,
    tenantId: row.tenantId,
    tenantCode: row.tenantCode,
    tenantName: row.tenantName,
    status: row.status as OffboardingStatus,
    terminatedAt: row.terminatedAt,
    terminatedBy: row.terminatedBy,
    terminationReason: row.terminationReason,
    purgeAfter: row.purgeAfter,
    cancelledAt: row.cancelledAt,
    cancelledBy: row.cancelledBy,
    exports: (row.exports as unknown as ExportEntry[]) ?? [],
    purgeStep: row.purgeStep as PurgeStep | null,
    purgeStartedAt: row.purgeStartedAt,
    purgedAt: row.purgedAt,
    purgedBy: row.purgedBy,
    earlyPurgeReason: row.earlyPurgeReason,
    stats: (row.stats as Record<string, unknown> | null) ?? null,
    orphanUserIds: (row.orphanUserIds as string[] | null) ?? null,
    deletedCounts: (row.deletedCounts as Record<string, unknown> | null) ?? null,
  };
}
