import { Readable } from 'node:stream';

export const EXPORT_STORAGE = Symbol('IExportStorage');

export type ZipEntry =
  { name: string; json: unknown } | { name: string; stream: () => Promise<Readable> };

export interface IExportStorage {
  /** Streams a ZIP with these entries to `key` (no full copy in memory). */
  uploadZip(key: string, entries: AsyncIterable<ZipEntry> | Iterable<ZipEntry>): Promise<void>;
  /** Time-limited download link. */
  presign(key: string, ttlSeconds: number): Promise<string>;
  /** Reads an object of the shared bucket (tenant files referenced by an export). */
  open(key: string): Promise<Readable>;
  /** Deletes every object under `prefix`; returns how many. */
  deletePrefix(prefix: string): Promise<number>;
}

export class ExportStorageNotConfiguredError extends Error {}
