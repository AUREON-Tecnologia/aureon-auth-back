import type {
  ServiceExport,
  ServiceStats,
  TenantDataSource,
} from '../domain/tenant-data-source.port';
import { TenantDataSourceError } from '../domain/tenant-data-source.port';

export const INTERNAL_KEY_HEADER = 'x-internal-key';
const TIMEOUT_MS = 120_000;

/**
 * Another AUREON service's /internal/tenants API (app-back, clients-back), authenticated with the shared
 * INTERNAL_API_KEY. Called over Railway's private network. Without a URL or key the source fails loudly instead of
 * letting a purge skip that service's data.
 */
export class HttpTenantDataSource implements TenantDataSource {
  constructor(
    readonly name: string,
    private readonly baseUrl: string | undefined,
    private readonly internalKey: string | undefined,
    private readonly fetchFn: typeof fetch = (input, init) => fetch(input, init),
  ) {}

  getStats(tenantId: string): Promise<ServiceStats> {
    return this.call<ServiceStats>('GET', tenantId, 'stats');
  }

  getExport(tenantId: string): Promise<ServiceExport> {
    return this.call<ServiceExport>('GET', tenantId, 'export');
  }

  async deleteFiles(tenantId: string): Promise<number> {
    return (await this.call<{ deleted: number }>('DELETE', tenantId, 'files')).deleted;
  }

  private async call<T>(method: 'GET' | 'DELETE', tenantId: string, what: string): Promise<T> {
    if (!this.baseUrl || !this.internalKey) {
      throw new TenantDataSourceError(this.name, 'internal URL or INTERNAL_API_KEY not configured');
    }
    const url = `${this.baseUrl.replace(/\/$/, '')}/internal/tenants/${encodeURIComponent(tenantId)}/${what}`;
    let response: Response;
    try {
      response = await this.fetchFn(url, {
        method,
        headers: { [INTERNAL_KEY_HEADER]: this.internalKey },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      throw new TenantDataSourceError(
        this.name,
        `network error (${error instanceof Error ? error.name : 'unknown'})`,
      );
    }
    if (!response.ok)
      throw new TenantDataSourceError(this.name, `HTTP ${response.status} on ${what}`);
    return (await response.json()) as T;
  }
}
