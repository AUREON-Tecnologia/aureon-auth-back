import {
  BadGatewayException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AuditLogService } from '../../../common/services/audit-log.service';
import { TENANT_REPOSITORY } from '../../tenants/domain/repositories/tenant.repository.interface';
import type { ITenantRepository } from '../../tenants/domain/repositories/tenant.repository.interface';
import {
  EXPORT_STORAGE,
  ExportStorageNotConfiguredError,
  ZipEntry,
} from '../domain/export-storage.port';
import type { IExportStorage } from '../domain/export-storage.port';
import { TENANT_DATA_SOURCES, TenantDataSourceError } from '../domain/tenant-data-source.port';
import type { ServiceExport, TenantDataSource } from '../domain/tenant-data-source.port';
import { TENANT_IDENTITY_STORE } from '../domain/tenant-identity.port';
import type { ITenantIdentityStore } from '../domain/tenant-identity.port';
import {
  EXPORT_LINK_TTL_SECONDS,
  PurgeStep,
  purgeAfter,
  remainingSteps,
  TenantOffboardingRecord,
} from '../domain/tenant-offboarding';
import { TENANT_OFFBOARDING_REPOSITORY } from '../domain/tenant-offboarding.repository';
import type { ITenantOffboardingRepository } from '../domain/tenant-offboarding.repository';

export const OFFBOARDING_CLOCK = Symbol('OffboardingClock');
export type OffboardingClock = () => Date;

export interface ExportResult {
  key: string;
  url: string;
  expiresAt: string;
}

/**
 * Contract end of a tenant (data policy v1.1, section 9; option B: Identity coordinates, each service cleans its own
 * data). Only platform admins reach it (PlatformAdminGuard); every step names its actor in the record and the audit log.
 */
@Injectable()
export class TenantOffboardingService {
  private readonly logger = new Logger(TenantOffboardingService.name);

  constructor(
    @Inject(TENANT_OFFBOARDING_REPOSITORY) private readonly records: ITenantOffboardingRepository,
    @Inject(TENANT_REPOSITORY) private readonly tenants: ITenantRepository,
    @Inject(TENANT_IDENTITY_STORE) private readonly identity: ITenantIdentityStore,
    @Inject(TENANT_DATA_SOURCES) private readonly sources: TenantDataSource[],
    @Inject(EXPORT_STORAGE) private readonly storage: IExportStorage,
    private readonly audit: AuditLogService,
    @Optional()
    @Inject(OFFBOARDING_CLOCK)
    private readonly clock: OffboardingClock = () => new Date(),
  ) {}

  /** Day 0: blocks the tenant at once (no new sessions, existing ones revoked) and opens the record. */
  async terminate(
    tenantId: string,
    actorId: string,
    reason: string,
  ): Promise<TenantOffboardingRecord> {
    const tenant = await this.tenants.findById(tenantId);
    if (!tenant) throw notFound('TENANT_NOT_FOUND', 'Tenant no encontrado');
    if (await this.records.findOpen(tenantId)) {
      throw new ConflictException({
        codigo: 'OFFBOARDING_YA_ABIERTO',
        mensaje: 'Este tenant ya tiene un proceso de terminacion abierto',
      });
    }

    const now = this.clock();
    const record = await this.records.create({
      tenantId,
      tenantCode: tenant.codigo,
      tenantName: tenant.nombre,
      terminatedAt: now,
      terminatedBy: actorId,
      terminationReason: reason,
      purgeAfter: purgeAfter(now),
    });
    await this.identity.setActive(tenantId, false);
    const revoked = await this.identity.revokeSessions(tenantId);
    this.audit.registrar({
      evento: 'TENANT_TERMINADO',
      tenantId,
      actorId,
      detalle: { purgeAfter: record.purgeAfter.toISOString(), ...revoked },
    });
    return record;
  }

  /** Renewal before the purge started: the tenant works again and the record is closed as CANCELLED. */
  async reactivate(tenantId: string, actorId: string): Promise<TenantOffboardingRecord> {
    const record = await this.requireOpen(tenantId);
    if (record.purgeStartedAt) {
      throw new ConflictException({
        codigo: 'PURGA_INICIADA',
        mensaje: 'La purga de este tenant ya inicio; no se puede reactivar',
      });
    }
    await this.identity.setActive(tenantId, true);
    const updated = await this.records.update(record.id, {
      status: 'CANCELLED',
      cancelledAt: this.clock(),
      cancelledBy: actorId,
    });
    this.audit.registrar({ evento: 'TENANT_REACTIVADO', tenantId, actorId });
    return updated;
  }

  /** Days 0-30: one ZIP with every service's data and files, behind a 7-day link. */
  async export(tenantId: string, actorId: string): Promise<ExportResult> {
    const record = await this.requireOpen(tenantId);
    if (record.purgeStartedAt) {
      throw new ConflictException({
        codigo: 'PURGA_INICIADA',
        mensaje: 'La purga de este tenant ya inicio; ya no se puede exportar',
      });
    }

    const parts = await this.collect(
      () => this.identity.getExport(tenantId),
      (s) => s.getExport(tenantId),
    );
    const now = this.clock();
    const key = `exports/${tenantId}/${now.toISOString().replace(/[:.]/g, '-')}.zip`;
    await this.withStorage(() =>
      this.storage.uploadZip(key, exportEntries(record, now, parts, this.storage)),
    );
    const url = await this.withStorage(() => this.storage.presign(key, EXPORT_LINK_TTL_SECONDS));
    const expiresAt = new Date(now.getTime() + EXPORT_LINK_TTL_SECONDS * 1000).toISOString();

    await this.records.update(record.id, {
      exports: [
        ...record.exports,
        { key, createdAt: now.toISOString(), createdBy: actorId, expiresAt },
      ],
    });
    this.audit.registrar({
      evento: 'TENANT_EXPORTADO',
      tenantId,
      actorId,
      detalle: { key, files: parts.reduce((n, p) => n + p.files.length, 0) },
    });
    return { key, url, expiresAt };
  }

  /**
   * Day 30 or later (earlier only with a written reason): statistics -> files -> exports -> tenant (cascade) ->
   * tenant-only users. Each step is saved when done, so calling again after a failure resumes where it stopped.
   */
  async purge(
    tenantId: string,
    actorId: string,
    earlyReason?: string,
  ): Promise<TenantOffboardingRecord> {
    const latest = await this.records.findLatest(tenantId);
    if (latest?.status === 'PURGED') return latest; // idempotent
    let record = await this.requireOpen(tenantId);

    if (!record.purgeStartedAt) {
      const early = this.clock() < record.purgeAfter;
      if (early && !earlyReason) {
        throw new ConflictException({
          codigo: 'PURGA_ANTICIPADA_SIN_MOTIVO',
          mensaje: `La purga regular es desde ${record.purgeAfter.toISOString()}; antes requiere un motivo`,
        });
      }
      record = await this.records.update(record.id, {
        purgeStartedAt: this.clock(),
        earlyPurgeReason: early ? (earlyReason ?? null) : null,
      });
      this.audit.registrar({
        evento: 'TENANT_PURGA_INICIADA',
        tenantId,
        actorId,
        detalle: { early, earlyReason: early ? earlyReason : undefined },
      });
    }

    for (const step of remainingSteps(record.purgeStep)) {
      record = await this.runStep(step, record);
      this.logger.log(`offboarding purge tenant=${tenantId} step=${step} done`);
    }

    record = await this.records.update(record.id, {
      status: 'PURGED',
      purgedAt: this.clock(),
      purgedBy: actorId,
    });
    this.audit.registrar({
      evento: 'TENANT_PURGADO',
      tenantId,
      actorId,
      detalle: { deletedCounts: record.deletedCounts },
    });
    return record;
  }

  async status(tenantId: string): Promise<TenantOffboardingRecord> {
    const record = await this.records.findLatest(tenantId);
    if (!record)
      throw notFound('OFFBOARDING_NO_ENCONTRADO', 'Este tenant no tiene proceso de terminacion');
    return record;
  }

  private async runStep(
    step: PurgeStep,
    record: TenantOffboardingRecord,
  ): Promise<TenantOffboardingRecord> {
    const { tenantId } = record;
    const counts = { ...(record.deletedCounts ?? {}) };
    switch (step) {
      case 'STATS': {
        const parts = await this.collect(
          () => this.identity.getStats(tenantId),
          (s) => s.getStats(tenantId),
        );
        const stats = { capturedAt: this.clock().toISOString(), services: parts };
        return this.records.update(record.id, { stats, purgeStep: step });
      }
      case 'FILES': {
        const files: Record<string, number> = {};
        for (const source of this.sources) {
          files[source.name] = await this.fromSource(source, () => source.deleteFiles(tenantId));
        }
        return this.records.update(record.id, {
          deletedCounts: { ...counts, files },
          purgeStep: step,
        });
      }
      case 'EXPORTS': {
        const exports = await this.withStorage(() =>
          this.storage.deletePrefix(`exports/${tenantId}/`),
        );
        return this.records.update(record.id, {
          deletedCounts: { ...counts, exports },
          purgeStep: step,
        });
      }
      case 'USERS_CAPTURED': {
        const orphanUserIds = await this.identity.findTenantOnlyUsers(tenantId);
        return this.records.update(record.id, { orphanUserIds, purgeStep: step });
      }
      case 'TENANT': {
        const tenant = await this.identity.deleteTenant(tenantId);
        return this.records.update(record.id, {
          deletedCounts: { ...counts, tenant },
          purgeStep: step,
        });
      }
      case 'USERS': {
        const users = await this.identity.removeUsers(record.orphanUserIds ?? []);
        return this.records.update(record.id, {
          deletedCounts: { ...counts, users },
          purgeStep: step,
        });
      }
    }
  }

  private async collect<T extends { service: string }>(
    own: () => Promise<T>,
    fromSource: (source: TenantDataSource) => Promise<T>,
  ): Promise<T[]> {
    const parts = [await own()];
    for (const source of this.sources)
      parts.push(await this.fromSource(source, () => fromSource(source)));
    return parts;
  }

  private async fromSource<T>(source: TenantDataSource, call: () => Promise<T>): Promise<T> {
    try {
      return await call();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      this.logger.warn(`offboarding source ${source.name} failed: ${message}`);
      throw new BadGatewayException({
        codigo: 'SERVICIO_NO_DISPONIBLE',
        mensaje: `No se pudo completar con ${source.name}; reintente (el proceso continua donde quedo)`,
        detalles: error instanceof TenantDataSourceError ? undefined : { source: source.name },
      });
    }
  }

  private async withStorage<T>(call: () => Promise<T>): Promise<T> {
    try {
      return await call();
    } catch (error) {
      if (error instanceof ExportStorageNotConfiguredError) {
        throw new ServiceUnavailableException({
          codigo: 'ALMACENAMIENTO_NO_CONFIGURADO',
          mensaje: 'El almacenamiento de exportaciones no esta configurado',
        });
      }
      throw error;
    }
  }

  private async requireOpen(tenantId: string): Promise<TenantOffboardingRecord> {
    const record = await this.records.findOpen(tenantId);
    if (!record) {
      throw notFound(
        'OFFBOARDING_NO_ABIERTO',
        'Este tenant no tiene un proceso de terminacion abierto',
      );
    }
    return record;
  }
}

function notFound(codigo: string, mensaje: string): NotFoundException {
  return new NotFoundException({ codigo, mensaje });
}

/** manifest.json, one JSON file per table, then every file of the tenant (streamed from the bucket). */
function* exportEntries(
  record: TenantOffboardingRecord,
  now: Date,
  parts: ServiceExport[],
  storage: IExportStorage,
): Generator<ZipEntry> {
  yield {
    name: 'manifest.json',
    json: {
      tenant: { id: record.tenantId, code: record.tenantCode, name: record.tenantName },
      generatedAt: now.toISOString(),
      services: parts.map((p) => ({
        service: p.service,
        tables: Object.fromEntries(Object.entries(p.tables).map(([t, rows]) => [t, rows.length])),
        files: p.files.length,
      })),
    },
  };
  for (const part of parts) {
    for (const [table, rows] of Object.entries(part.tables)) {
      yield { name: `${part.service}/${table}.json`, json: rows };
    }
    for (const file of part.files) {
      yield { name: `${part.service}/files/${file.key}`, stream: () => storage.open(file.key) };
    }
  }
}
