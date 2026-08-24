import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PlatformAdminCommandService } from './application/commands/platform-admin-command.service';
import { PlatformMembershipCommandService } from './application/commands/platform-membership-command.service';
import { PlatformAdminsController } from './presentation/controllers/platform-admins.controller';
import { PlatformMembershipsController } from './presentation/controllers/platform-memberships.controller';

/**
 * RBAC_REPOSITORY and TENANT_REPOSITORY come from RbacModule/TenantsModule,
 * both @Global() -- no explicit import needed for those. AuthModule is NOT
 * global, so it's imported here for AUTH_REPOSITORY (same reason TenantsModule
 * imports it).
 */
@Module({
  imports: [AuthModule],
  controllers: [PlatformAdminsController, PlatformMembershipsController],
  providers: [PlatformAdminCommandService, PlatformMembershipCommandService],
})
export class PlatformModule {}
