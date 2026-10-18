import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser, JwtAuthGuard, SkipCsrf } from '@aureon/redis-client';
import type { JwtPayload } from '@aureon/redis-client';
import { PlatformAdminGuard } from '../../../common/guards/platform-admin.guard';
import { TenantOffboardingService } from '../application/tenant-offboarding.service';
import { TenantOffboardingRecord } from '../domain/tenant-offboarding';
import { PurgeTenantDto, TerminateTenantDto } from './dto/offboarding.dto';

/**
 * Tenant contract end (data policy v1.1, section 9). Platform admins only, with a real session so every step is
 * attributable to an actor in the record (same model as /platform/memberships).
 *
 * @SkipCsrf(): same accepted technical debt as PlatformMembershipsController (CLAUDE.md, "CSRF deshabilitado en
 * endpoints de sesion real"). Removing this decorator is the only change needed to revert it here.
 */
@Controller('tenants/:id')
@UseGuards(JwtAuthGuard, PlatformAdminGuard)
@SkipCsrf()
export class TenantOffboardingController {
  constructor(private readonly offboarding: TenantOffboardingService) {}

  @Post('terminate')
  @HttpCode(HttpStatus.OK)
  async terminate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TerminateTenantDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return toResponse(await this.offboarding.terminate(id, user.sub, dto.reason));
  }

  @Post('reactivate')
  @HttpCode(HttpStatus.OK)
  async reactivate(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    return toResponse(await this.offboarding.reactivate(id, user.sub));
  }

  @Post('export')
  @HttpCode(HttpStatus.OK)
  export(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    return this.offboarding.export(id, user.sub);
  }

  @Post('purge')
  @HttpCode(HttpStatus.OK)
  async purge(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PurgeTenantDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return toResponse(await this.offboarding.purge(id, user.sub, dto.earlyReason));
  }

  @Get('offboarding')
  async status(@Param('id', ParseUUIDPipe) id: string) {
    return toResponse(await this.offboarding.status(id));
  }
}

/** The record as the API shows it. orphanUserIds stays internal (it is only needed to finish a purge). */
function toResponse(r: TenantOffboardingRecord) {
  return {
    id: r.id,
    tenantId: r.tenantId,
    tenantCode: r.tenantCode,
    tenantName: r.tenantName,
    status: r.status,
    terminatedAt: r.terminatedAt.toISOString(),
    terminatedBy: r.terminatedBy,
    terminationReason: r.terminationReason,
    purgeAfter: r.purgeAfter.toISOString(),
    cancelledAt: r.cancelledAt?.toISOString() ?? null,
    cancelledBy: r.cancelledBy,
    exports: r.exports,
    purgeStep: r.purgeStep,
    purgeStartedAt: r.purgeStartedAt?.toISOString() ?? null,
    purgedAt: r.purgedAt?.toISOString() ?? null,
    purgedBy: r.purgedBy,
    earlyPurgeReason: r.earlyPurgeReason,
    stats: r.stats,
    deletedCounts: r.deletedCounts,
  };
}
