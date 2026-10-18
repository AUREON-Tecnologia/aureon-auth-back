import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TenantOffboardingService } from './application/tenant-offboarding.service';
import { EXPORT_STORAGE } from './domain/export-storage.port';
import { TENANT_DATA_SOURCES } from './domain/tenant-data-source.port';
import { TENANT_IDENTITY_STORE } from './domain/tenant-identity.port';
import { TENANT_OFFBOARDING_REPOSITORY } from './domain/tenant-offboarding.repository';
import { HttpTenantDataSource } from './infrastructure/http-tenant-data-source';
import { PrismaTenantIdentityStore } from './infrastructure/prisma-tenant-identity.store';
import { PrismaTenantOffboardingRepository } from './infrastructure/prisma-tenant-offboarding.repository';
import { ExportStorageConfig, S3ExportStorage } from './infrastructure/s3-export-storage';
import { TenantOffboardingController } from './presentation/tenant-offboarding.controller';

interface OffboardingConfig {
  internalApiKey?: string;
  appBackInternalUrl?: string;
  clientsBackInternalUrl?: string;
  storage: ExportStorageConfig | null;
}

const config = (c: ConfigService) => c.getOrThrow<OffboardingConfig>('offboarding');

/** TENANT_REPOSITORY comes from TenantsModule (@Global). */
@Module({
  controllers: [TenantOffboardingController],
  providers: [
    TenantOffboardingService,
    { provide: TENANT_OFFBOARDING_REPOSITORY, useClass: PrismaTenantOffboardingRepository },
    { provide: TENANT_IDENTITY_STORE, useClass: PrismaTenantIdentityStore },
    {
      provide: TENANT_DATA_SOURCES,
      inject: [ConfigService],
      useFactory: (c: ConfigService) => {
        const { internalApiKey, appBackInternalUrl, clientsBackInternalUrl } = config(c);
        return [
          new HttpTenantDataSource('app-back', appBackInternalUrl, internalApiKey),
          new HttpTenantDataSource('clients-back', clientsBackInternalUrl, internalApiKey),
        ];
      },
    },
    {
      provide: EXPORT_STORAGE,
      inject: [ConfigService],
      useFactory: (c: ConfigService) => new S3ExportStorage(config(c).storage),
    },
  ],
})
export class OffboardingModule {}
