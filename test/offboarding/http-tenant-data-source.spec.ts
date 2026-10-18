import { HttpTenantDataSource } from '../../src/modules/offboarding/infrastructure/http-tenant-data-source';
import { TenantDataSourceError } from '../../src/modules/offboarding/domain/tenant-data-source.port';

function fakeFetch(status: number, body: unknown) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fn = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(body), { status });
  }) as unknown as typeof fetch;
  return { fn, calls };
}

describe('HttpTenantDataSource', () => {
  it('calls /internal/tenants/:id/... with the internal key', async () => {
    const f = fakeFetch(200, { service: 'app-back', metrics: [] });
    const source = new HttpTenantDataSource(
      'app-back',
      'http://app-back.internal:8080/',
      'k'.repeat(32),
      f.fn,
    );
    await source.getStats('t1');
    expect(f.calls[0].url).toBe('http://app-back.internal:8080/internal/tenants/t1/stats');
    expect((f.calls[0].init.headers as Record<string, string>)['x-internal-key']).toBe(
      'k'.repeat(32),
    );
  });

  it('deleteFiles uses DELETE and returns the count', async () => {
    const f = fakeFetch(200, { service: 'app-back', deleted: 4 });
    const source = new HttpTenantDataSource('app-back', 'http://x', 'k'.repeat(32), f.fn);
    await expect(source.deleteFiles('t1')).resolves.toBe(4);
    expect(f.calls[0].init.method).toBe('DELETE');
  });

  it('fails loudly when not configured or when the service answers an error', async () => {
    await expect(
      new HttpTenantDataSource('clients-back', undefined, 'k', fetch).getStats('t1'),
    ).rejects.toBeInstanceOf(TenantDataSourceError);
    const f = fakeFetch(401, {});
    await expect(
      new HttpTenantDataSource('app-back', 'http://x', 'k', f.fn).getExport('t1'),
    ).rejects.toThrow(/HTTP 401/);
  });
});
