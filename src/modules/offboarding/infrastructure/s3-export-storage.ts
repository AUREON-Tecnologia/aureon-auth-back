import {
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import archiver from 'archiver';
import { PassThrough, Readable } from 'node:stream';
import { ExportStorageNotConfiguredError } from '../domain/export-storage.port';
import type { IExportStorage, ZipEntry } from '../domain/export-storage.port';

export interface ExportStorageConfig {
  endpoint: string;
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
}

/**
 * The shared Railway bucket (S3-compatible, Tigris): exports are written under `exports/{tenantId}/`; tenant files
 * (photos, signatures written by workshop) are only read from here, and deleted by workshop itself on purge.
 */
export class S3ExportStorage implements IExportStorage {
  private readonly client: S3Client | null;
  private readonly bucket: string;

  constructor(config: ExportStorageConfig | null) {
    this.bucket = config?.bucket ?? '';
    this.client = config
      ? new S3Client({
          endpoint: config.endpoint,
          region: config.region,
          forcePathStyle: false,
          credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
        })
      : null;
  }

  async uploadZip(
    key: string,
    entries: AsyncIterable<ZipEntry> | Iterable<ZipEntry>,
  ): Promise<void> {
    const client = this.requireClient();
    const body = new PassThrough();
    const upload = new Upload({
      client,
      params: { Bucket: this.bucket, Key: key, Body: body, ContentType: 'application/zip' },
    });
    const uploaded = upload.done();
    try {
      await writeZip(entries, body);
    } catch (error) {
      await upload.abort().catch(() => undefined);
      throw error;
    }
    await uploaded;
  }

  async presign(key: string, ttlSeconds: number): Promise<string> {
    return getSignedUrl(
      this.requireClient(),
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      {
        expiresIn: ttlSeconds,
      },
    );
  }

  async open(key: string): Promise<Readable> {
    const result = await this.requireClient().send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    return result.Body as Readable;
  }

  async deletePrefix(prefix: string): Promise<number> {
    const client = this.requireClient();
    let deleted = 0;
    let token: string | undefined;
    do {
      const page = await client.send(
        new ListObjectsV2Command({ Bucket: this.bucket, Prefix: prefix, ContinuationToken: token }),
      );
      const keys = (page.Contents ?? []).map((o) => ({ Key: o.Key! }));
      if (keys.length > 0) {
        await client.send(
          new DeleteObjectsCommand({ Bucket: this.bucket, Delete: { Objects: keys, Quiet: true } }),
        );
        deleted += keys.length;
      }
      token = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (token);
    return deleted;
  }

  private requireClient(): S3Client {
    if (!this.client)
      throw new ExportStorageNotConfiguredError('EXPORT_STORAGE_S3_* is not configured');
    return this.client;
  }
}

/** Streams the entries as a ZIP into `target`, one file at a time (never the whole export in memory). */
export async function writeZip(
  entries: AsyncIterable<ZipEntry> | Iterable<ZipEntry>,
  target: NodeJS.WritableStream,
): Promise<void> {
  const archive = archiver('zip', { zlib: { level: 6 } });
  archive.pipe(target);
  try {
    for await (const entry of entries) {
      if ('json' in entry) {
        archive.append(JSON.stringify(entry.json, null, 2), { name: entry.name });
        continue;
      }
      // Wait until archiver has consumed this stream before opening the next one.
      const stream = await entry.stream();
      await new Promise<void>((resolve, reject) => {
        stream.once('error', reject);
        archive.once('entry', () => resolve());
        archive.append(stream, { name: entry.name });
      });
    }
    await archive.finalize();
  } catch (error) {
    archive.abort();
    throw error;
  }
}
