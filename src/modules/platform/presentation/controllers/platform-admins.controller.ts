import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import { SkipCsrf } from '@aureon/redis-client';
import { PlatformBootstrapGuard } from '../../../../common/guards/platform-bootstrap.guard';
import { PlatformAdminCommandService } from '../../application/commands/platform-admin-command.service';
import { GrantPlatformAdminDto } from '../dto/grant-platform-admin.dto';

/**
 * Shared-secret gated, same pattern as TenantsController: granting the FIRST
 * platform admin can't depend on a session with the very claim being granted.
 * @SkipCsrf() at the class level (found 2026-08-23): this route authenticates
 * via X-Platform-Bootstrap-Key, never via a session cookie -- a stale
 * csrf_token cookie from an unrelated session (e.g. Postman's own cookie jar
 * after testing login/switch-tenant) must not be able to block a bootstrap
 * operation that doesn't use cookies for auth at all.
 */
@Controller('platform/admins')
@UseGuards(PlatformBootstrapGuard)
@SkipCsrf()
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
