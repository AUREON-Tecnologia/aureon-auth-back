import { Global, Module } from '@nestjs/common';
import { RBAC_REPOSITORY } from './domain/repositories/rbac.repository.interface';
import { SupabaseRbacRepository } from './infrastructure/repositories/supabase-rbac.repository';
import { RbacSeedService } from './application/services/rbac-seed.service';
import { RbacAdminService } from './application/services/rbac-admin.service';
import { MembresiaQueryService } from './application/services/membresia-query.service';
import { MembresiaCommandService } from './application/commands/membresia-command.service';
import { RolesController } from './presentation/controllers/roles.controller';
import { PermisosController } from './presentation/controllers/permisos.controller';
import { MembresiasController } from './presentation/controllers/membresias.controller';

/**
 * Global: RBAC_REPOSITORY y RbacSeedService los necesitan modulos/guards de fuera
 * de este modulo (AuthCommandService para calcular `permisos`, PermissionsGuard en
 * common/, TenantCommandService al crear un tenant) sin crear un ciclo de imports.
 */
@Global()
@Module({
  controllers: [RolesController, PermisosController, MembresiasController],
  providers: [
    { provide: RBAC_REPOSITORY, useClass: SupabaseRbacRepository },
    RbacSeedService,
    RbacAdminService,
    MembresiaQueryService,
    MembresiaCommandService,
  ],
  exports: [RBAC_REPOSITORY, RbacSeedService],
})
export class RbacModule {}
