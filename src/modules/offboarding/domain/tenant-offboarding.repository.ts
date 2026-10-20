import { OffboardingStatus, TenantOffboardingRecord } from './tenant-offboarding';

export const TENANT_OFFBOARDING_REPOSITORY = Symbol('ITenantOffboardingRepository');

export interface CreateOffboardingData {
  tenantId: string;
  tenantCode: string;
  tenantName: string;
  terminatedAt: Date;
  terminatedBy: string;
  terminationReason: string;
  purgeAfter: Date;
}

export type OffboardingPatch = Partial<
  Pick<
    TenantOffboardingRecord,
    | 'cancelledAt'
    | 'cancelledBy'
    | 'exports'
    | 'purgeStep'
    | 'purgeStartedAt'
    | 'purgedAt'
    | 'purgedBy'
    | 'earlyPurgeReason'
    | 'stats'
    | 'orphanUserIds'
    | 'deletedCounts'
  > & { status: OffboardingStatus }
>;

export interface ITenantOffboardingRepository {
  /** The open (TERMINATED) process of a tenant, if any. At most one (partial unique index in the DDL). */
  findOpen(tenantId: string): Promise<TenantOffboardingRecord | null>;
  /** Most recent record of a tenant, whatever its status. */
  findLatest(tenantId: string): Promise<TenantOffboardingRecord | null>;
  /**
   * Open (TERMINATED) processes the automatic purge must run: the 30 days are over, or a purge already started and
   * stopped halfway (an early one included). Oldest first.
   */
  findDueForPurge(now: Date): Promise<TenantOffboardingRecord[]>;
  create(data: CreateOffboardingData): Promise<TenantOffboardingRecord>;
  update(id: string, patch: OffboardingPatch): Promise<TenantOffboardingRecord>;
}
