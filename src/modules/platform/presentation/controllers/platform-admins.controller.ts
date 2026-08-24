import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import { PlatformBootstrapGuard } from '../../../../common/guards/platform-bootstrap.guard';
import { PlatformAdminCommandService } from '../../application/commands/platform-admin-command.service';
import { GrantPlatformAdminDto } from '../dto/grant-platform-admin.dto';

/**
 * Shared-secret gated, same pattern as TenantsController: granting the FIRST
 * platform admin can't depend on a session with the very claim being granted.
 */
@Controller('platform/admins')
@UseGuards(PlatformBootstrapGuard)
export class PlatformAdminsController {
  constructor(private readonly platformAdminCommandService: PlatformAdminCommandService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  grant(@Body() dto: GrantPlatformAdminDto) {
    return this.platformAdminCommandService.grant(dto.email);
  }

  @Delete(':userId')
  revoke(@Param('userId') userId: string) {
    return this.platformAdminCommandService.revoke(userId);
  }

  @Get()
  list() {
    return this.platformAdminCommandService.list();
  }
}
