/**
 * Contract end of a tenant (data policy v1.1, section 9): terminate -> optional exports during 30 calendar days ->
 * purge (aggregated statistics are kept, everything else is deleted). The record survives the purge.
 */
export type OffboardingStatus = 'TERMINATED' | 'CANCELLED' | 'PURGED';

/** Purge steps, in order. The record stores the last one completed, so a failed purge resumes where it stopped. */
export const PURGE_STEPS = [
  'STATS',
  'FILES',
  'EXPORTS',
  'USERS_CAPTURED',
  'TENANT',
  'USERS',
] as const;
export type PurgeStep = (typeof PURGE_STEPS)[number];

/** Calendar days between termination and the earliest regular purge. */
export const RETENTION_AFTER_TERMINATION_DAYS = 30;
/** Lifetime of an export download link (S3 presigned URLs allow at most 7 days). */
export const EXPORT_LINK_TTL_SECONDS = 7 * 24 * 60 * 60;

export interface ExportEntry {
  key: string;
  createdAt: string;
  createdBy: string;
  expiresAt: string;
}

export interface TenantOffboardingRecord {
  id: string;
  tenantId: string;
  tenantCode: string;
  tenantName: string;
  status: OffboardingStatus;
  terminatedAt: Date;
  terminatedBy: string;
  terminationReason: string;
  purgeAfter: Date;
  cancelledAt: Date | null;
  cancelledBy: string | null;
  exports: ExportEntry[];
  purgeStep: PurgeStep | null;
  purgeStartedAt: Date | null;
  purgedAt: Date | null;
  purgedBy: string | null;
  earlyPurgeReason: string | null;
  stats: Record<string, unknown> | null;
  orphanUserIds: string[] | null;
  deletedCounts: Record<string, unknown> | null;
}

export function purgeAfter(terminatedAt: Date): Date {
  return new Date(terminatedAt.getTime() + RETENTION_AFTER_TERMINATION_DAYS * 24 * 60 * 60 * 1000);
}

/** Steps still to run after `last` (all of them when the purge has not started). */
export function remainingSteps(last: PurgeStep | null): PurgeStep[] {
  return last === null ? [...PURGE_STEPS] : PURGE_STEPS.slice(PURGE_STEPS.indexOf(last) + 1);
}
