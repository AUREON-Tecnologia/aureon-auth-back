/** One other AUREON service holding tenant data (app-back, clients-back), reached through its /internal API. */
export const TENANT_DATA_SOURCES = Symbol('TenantDataSources');

/** Aggregated, anonymous figures. `month` is "YYYY-MM", or null for a point-in-time total. */
export interface StatMetric {
  metric: string;
  month: string | null;
  value: number;
}

export interface ServiceStats {
  service: string;
  metrics: StatMetric[];
}

export interface ServiceExport {
  service: string;
  /** "schema.table" -> rows, as JSON. */
  tables: Record<string, unknown[]>;
  /** Objects in the shared bucket that belong to the tenant (photos, signatures). */
  files: { key: string; size?: number }[];
}

export interface TenantDataSource {
  readonly name: string;
  getStats(tenantId: string): Promise<ServiceStats>;
  getExport(tenantId: string): Promise<ServiceExport>;
  /** Deletes the tenant's files; returns how many. Sources without files return 0. */
  deleteFiles(tenantId: string): Promise<number>;
}

/** A source failed or is not configured: the operation stops (and, for a purge, can be resumed). */
export class TenantDataSourceError extends Error {
  constructor(
    readonly source: string,
    message: string,
  ) {
    super(`${source}: ${message}`);
  }
}
