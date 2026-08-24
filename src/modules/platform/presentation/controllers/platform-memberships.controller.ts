import { Body, Controller, Delete, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { CurrentUser, JwtAuthGuard, JwtPayload } from '@aureon/redis-client';
import { PlatformAdminGuard } from '../../../../common/guards/platform-admin.guard';
import { PlatformMembershipCommandService } from '../../application/commands/platform-membership-command.service';
import { CreatePlatformMembershipDto } from '../dto/create-platform-membership.dto';
import { UpdatePlatformMembershipDto } from '../dto/update-platform-membership.dto';

/**
 * Cross-tenant counterpart of MembresiasController -- gated by a real JWT
 * session carrying the `platformAdmin` claim, not the bootstrap secret (using
 * the power is auditable to an actor; granting the flag itself is bootstrap,
 * see PlatformAdminsController).
 */
@Controller('platform/memberships')
@UseGuards(JwtAuthGuard, PlatformAdminGuard)
export class PlatformMembershipsController {
  constructor(private readonly platformMembershipCommandService: PlatformMembershipCommandService) {}

  @Post()
  create(@Body() dto: CreatePlatformMembershipDto, @CurrentUser() user: JwtPayload) {
    return this.platformMembershipCommandService.create(dto, user.sub);
  }

  @Patch(':id')
  updateRole(@Param('id') id: string, @Body() dto: UpdatePlatformMembershipDto, @CurrentUser() user: JwtPayload) {
    return this.platformMembershipCommandService.updateRole(id, dto.roleCode, user.sub);
  }

  @Delete(':id')
  deactivate(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.platformMembershipCommandService.deactivate(id, user.sub);
  }
}
