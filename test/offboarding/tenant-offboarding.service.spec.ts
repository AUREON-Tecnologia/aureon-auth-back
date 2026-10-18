import { BadGatewayException, ConflictException, NotFoundException } from '@nestjs/common';
import { Readable } from 'node:stream';
import { AuditLogService } from '../../src/common/services/audit-log.service';
import { Tenant } from '../../src/modules/tenants/domain/entities/tenant.entity';
import type { ITenantRepository } from '../../src/modules/tenants/domain/repositories/tenant.repository.interface';
import { TenantOffboardingService } from '../../src/modules/offboarding/application/tenant-offboarding.service';
import type {
  IExportStorage,
  ZipEntry,
} from '../../src/modules/offboarding/domain/export-storage.port';
import type { TenantDataSource } from '../../src/modules/offboarding/domain/tenant-data-source.port';
import type { ITenantIdentityStore } from '../../src/modules/offboarding/domain/tenant-identity.port';
import { TenantOffboardingRecord } from '../../src/modules/offboarding/domain/tenant-offboarding';
import type {
  CreateOffboardingData,
  ITenantOffboardingRepository,
  OffboardingPatch,
} from '../../src/modules/offboarding/domain/tenant-offboarding.repository';

const TENANT = '11111111-1111-4111-8111-111111111111';
const ADMIN = '99999999-9999-4999-8999-999999999999';
const DAY = 24 * 60 * 60 * 1000;

class MemRecords implements ITenantOffboardingRepository {
  rows: TenantOffboardingRecord[] = [];
  async findOpen(tenantId: string) {
    return this.rows.find((r) => r.tenantId === tenantId && r.status === 'TERMINATED') ?? null;
  }
  async findLatest(tenantId: string) {
    return [...this.rows].reverse().find((r) => r.tenantId === tenantId) ?? null;
  }
  async create(d: CreateOffboardingData) {
    const row: TenantOffboardingRecord = {
      ...d,
      id: `rec-${this.rows.length + 1}`,
      status: 'TERMINATED',
      cancelledAt: null,
      cancelledBy: null,
      exports: [],
      purgeStep: null,
      purgeStartedAt: null,
      purgedAt: null,
      purgedBy: null,
      earlyPurgeReason: null,
      stats: null,
      orphanUserIds: null,
      deletedCounts: null,
    };
    this.rows.push(row);
    return { ...row };
  }
  async update(id: string, patch: OffboardingPatch) {
    const row = this.rows.find((r) => r.id === id)!;
    Object.assign(row, patch);
    return { ...row };
  }
}

function setup(opts: { failSourceOn?: string } = {}) {
  let now = new Date('2026-10-18T12:00:00Z');
  const records = new MemRecords();
  const calls: string[] = [];
  const tenants: Pick<ITenantRepository, 'findById'> = {
    findById: async (id) =>
      id === TENANT ? new Tenant(TENANT, 'taller-x', 'Taller X', true, {}, new Date()) : null,
  };
  const identity: ITenantIdentityStore = {
    setActive: async (_id, active) => void calls.push(`identity.setActive:${active}`),
    revokeSessions: async () => (
      calls.push('identity.revoke'),
      { refreshTokens: 2, accessTokens: 1 }
    ),
    getStats: async () => ({
      service: 'identity',
      metrics: [{ metric: 'identity.active_members', month: null, value: 3 }],
    }),
    getExport: async () => ({
      service: 'identity',
      tables: { 'app_auth.roles': [{ code: 'administrador' }] },
      files: [],
    }),
    findTenantOnlyUsers: async () => (calls.push('identity.findUsers'), ['u1', 'u2']),
    deleteTenant: async () => (calls.push('identity.deleteTenant'), true),
    removeUsers: async (ids) => (
      calls.push(`identity.removeUsers:${ids.join(',')}`),
      { deleted: 2, anonymized: 0 }
    ),
  };
  const source = (name: string, files: string[]): TenantDataSource => ({
    name,
    getStats: async () => {
      if (opts.failSourceOn === `${name}.stats`) throw new Error('down');
      return { service: name, metrics: [{ metric: `${name}.x`, month: '2026-10', value: 1 }] };
    },
    getExport: async () => ({
      service: name,
      tables: { [`${name}.t`]: [{ a: 1 }] },
      files: files.map((key) => ({ key })),
    }),
    deleteFiles: async () => {
      calls.push(`${name}.deleteFiles`);
      if (opts.failSourceOn === `${name}.files`) throw new Error('down');
      return files.length;
    },
  });
  const zips: { key: string; names: string[] }[] = [];
  const storage: IExportStorage = {
    uploadZip: async (key, entries) => {
      const names: string[] = [];
      for await (const e of entries as AsyncIterable<ZipEntry>) names.push(e.name);
      zips.push({ key, names });
    },
    presign: async (key) => `https://signed/${key}`,
    open: async () => Readable.from(['x']),
    deletePrefix: async (prefix) => (calls.push(`storage.deletePrefix:${prefix}`), zips.length),
  };
  const service = new TenantOffboardingService(
    records,
    tenants as ITenantRepository,
    identity,
    [source('app-back', ['workshop/t/1.jpg']), source('clients-back', [])],
    storage,
    new AuditLogService(),
    () => now,
  );
  return {
    service,
    records,
    calls,
    zips,
    advance: (ms: number) => (now = new Date(now.getTime() + ms)),
  };
}

describe('TenantOffboardingService', () => {
  it('terminate: deactivates the tenant, revokes sessions and schedules the purge 30 calendar days later', async () => {
    const { service, calls } = setup();
    const record = await service.terminate(TENANT, ADMIN, 'Fin del contrato');
    expect(record).toMatchObject({
      status: 'TERMINATED',
      terminatedBy: ADMIN,
      tenantCode: 'taller-x',
    });
    expect(record.purgeAfter.toISOString()).toBe('2026-11-17T12:00:00.000Z');
    expect(calls).toEqual(['identity.setActive:false', 'identity.revoke']);
  });

  it('terminate: 404 for an unknown tenant, 409 when already terminated', async () => {
    const { service } = setup();
    await expect(service.terminate('nope', ADMIN, 'motivo')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await service.terminate(TENANT, ADMIN, 'Fin del contrato');
    await expect(service.terminate(TENANT, ADMIN, 'otra vez')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('reactivate: only before the purge starts', async () => {
    const { service, calls } = setup();
    await service.terminate(TENANT, ADMIN, 'Fin del contrato');
    const cancelled = await service.reactivate(TENANT, ADMIN);
    expect(cancelled).toMatchObject({ status: 'CANCELLED', cancelledBy: ADMIN });
    expect(calls).toContain('identity.setActive:true');
    await expect(service.reactivate(TENANT, ADMIN)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('export: one ZIP with manifest, every table and every file, under exports/{tenant}/, 7-day link', async () => {
    const { service, zips, records } = setup();
    await service.terminate(TENANT, ADMIN, 'Fin del contrato');
    const result = await service.export(TENANT, ADMIN);

    expect(result.key).toMatch(new RegExp(`^exports/${TENANT}/.+\\.zip$`));
    expect(result.url).toBe(`https://signed/${result.key}`);
    expect(result.expiresAt).toBe('2026-10-25T12:00:00.000Z');
    expect(zips[0].names).toEqual([
      'manifest.json',
      'identity/app_auth.roles.json',
      'app-back/app-back.t.json',
      'app-back/files/workshop/t/1.jpg',
      'clients-back/clients-back.t.json',
    ]);
    expect(records.rows[0].exports).toEqual([
      expect.objectContaining({ key: result.key, createdBy: ADMIN }),
    ]);
  });

  it('export: refused without an open process', async () => {
    const { service } = setup();
    await expect(service.export(TENANT, ADMIN)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('purge: refused before day 30 without a reason', async () => {
    const { service, calls } = setup();
    await service.terminate(TENANT, ADMIN, 'Fin del contrato');
    await expect(service.purge(TENANT, ADMIN)).rejects.toBeInstanceOf(ConflictException);
    expect(calls).not.toContain('identity.deleteTenant');
  });

  it('purge: on day 30 runs every step in order and keeps only statistics and counts', async () => {
    const { service, calls, advance } = setup();
    await service.terminate(TENANT, ADMIN, 'Fin del contrato');
    advance(30 * DAY);
    calls.length = 0;

    const record = await service.purge(TENANT, ADMIN);

    expect(calls).toEqual([
      'app-back.deleteFiles',
      'clients-back.deleteFiles',
      `storage.deletePrefix:exports/${TENANT}/`,
      'identity.findUsers',
      'identity.deleteTenant',
      'identity.removeUsers:u1,u2',
    ]);
    expect(record).toMatchObject({
      status: 'PURGED',
      purgedBy: ADMIN,
      purgeStep: 'USERS',
      earlyPurgeReason: null,
    });
    expect(
      (record.stats as { services: { service: string }[] }).services.map((s) => s.service),
    ).toEqual(['identity', 'app-back', 'clients-back']);
    expect(record.deletedCounts).toEqual({
      files: { 'app-back': 1, 'clients-back': 0 },
      exports: 0,
      tenant: true,
      users: { deleted: 2, anonymized: 0 },
    });
  });

  it('purge: early with a reason, which is kept in the record', async () => {
    const { service } = setup();
    await service.terminate(TENANT, ADMIN, 'Fin del contrato');
    const record = await service.purge(TENANT, ADMIN, 'El cliente lo pidio por escrito');
    expect(record).toMatchObject({
      status: 'PURGED',
      earlyPurgeReason: 'El cliente lo pidio por escrito',
    });
  });

  it('purge: a failing service stops it before the tenant is deleted and keeps the last completed step', async () => {
    const { service, calls, records, advance } = setup({ failSourceOn: 'clients-back.files' });
    await service.terminate(TENANT, ADMIN, 'Fin del contrato');
    advance(31 * DAY);

    await expect(service.purge(TENANT, ADMIN)).rejects.toBeInstanceOf(BadGatewayException);
    expect(records.rows[0]).toMatchObject({ status: 'TERMINATED', purgeStep: 'STATS' });
    expect(calls).not.toContain('identity.deleteTenant');
    await expect(service.reactivate(TENANT, ADMIN)).rejects.toBeInstanceOf(ConflictException);
  });

  it('purge: idempotent once done', async () => {
    const { service, calls, advance } = setup();
    await service.terminate(TENANT, ADMIN, 'Fin del contrato');
    advance(30 * DAY);
    await service.purge(TENANT, ADMIN);
    calls.length = 0;
    await expect(service.purge(TENANT, ADMIN)).resolves.toMatchObject({ status: 'PURGED' });
    expect(calls).toEqual([]);
  });

  it('a failing service blocks the STATS step too (nothing is purged without statistics)', async () => {
    const { service, calls, advance } = setup({ failSourceOn: 'app-back.stats' });
    await service.terminate(TENANT, ADMIN, 'Fin del contrato');
    advance(30 * DAY);
    await expect(service.purge(TENANT, ADMIN)).rejects.toBeInstanceOf(BadGatewayException);
    expect(calls).not.toContain('app-back.deleteFiles');
  });
});
