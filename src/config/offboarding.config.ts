import { registerAs } from '@nestjs/config';

/**
 * Tenant contract end (offboarding). Every value is optional so the service boots without them; the offboarding
 * endpoints then answer 502/503 instead of silently skipping a service's data.
 */
export default registerAs('offboarding', () => ({
  /** Shared secret for the /internal APIs of app-back and clients-back (header X-Internal-Key). */
  internalApiKey: process.env.INTERNAL_API_KEY || undefined,
  appBackInternalUrl: process.env.APP_BACK_INTERNAL_URL || undefined,
  clientsBackInternalUrl: process.env.CLIENTS_BACK_INTERNAL_URL || undefined,
  /** Daily automatic purge of processes whose 30 days are over (08:30 UTC). On unless set to "false". */
  autoPurgeEnabled: process.env.OFFBOARDING_AUTO_PURGE_ENABLED !== 'false',
  /** Same Railway bucket as workshop's STORAGE_S3_*: exports go under exports/{tenantId}/. */
  storage: process.env.EXPORT_STORAGE_S3_BUCKET
    ? {
        endpoint: process.env.EXPORT_STORAGE_S3_ENDPOINT ?? '',
        bucket: process.env.EXPORT_STORAGE_S3_BUCKET,
        region: process.env.EXPORT_STORAGE_S3_REGION ?? 'auto',
        accessKeyId: process.env.EXPORT_STORAGE_S3_ACCESS_KEY_ID ?? '',
        secretAccessKey: process.env.EXPORT_STORAGE_S3_SECRET_ACCESS_KEY ?? '',
      }
    : null,
}));
