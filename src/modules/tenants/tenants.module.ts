import { Global, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TENANT_REPOSITORY } from './domain/repositories/tenant.repository.interface';
import { SupabaseTenantRepository } from './infrastructure/repositories/supabase-tenant.repository';
import { TenantCommandService } from './application/commands/tenant-command.service';
import { TenantQueryService } from './application/queries/tenant-query.service';
import { TenantsController } from './presentation/controllers/tenants.controller';

/**
 * Global + importa AuthModule (para AUTH_REPOSITORY al crear el usuario admin del
 * tenant). AuthModule a su vez necesita TENANT_REPOSITORY (login/register) — al
 * ser este modulo global, AuthModule lo resuelve sin tener que importar TenantsModule
 * de vuelta (evita el ciclo).
 */
@Global()
@Module({
  imports: [AuthModule],
  controllers: [TenantsController],
  providers: [
    { provide: TENANT_REPOSITORY, useClass: SupabaseTenantRepository },
    TenantCommandService,
    TenantQueryService,
  ],
  exports: [TENANT_REPOSITORY],
})
export class TenantsModule {}
