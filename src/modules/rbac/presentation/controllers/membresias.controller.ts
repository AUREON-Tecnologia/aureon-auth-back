import { Body, Controller, Delete, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { CurrentUser, JwtAuthGuard, JwtPayload, Roles, RolesGuard, SkipCsrf } from '@aureon/redis-client';
import { PermissionsGuard } from '../../../../common/guards/permissions.guard';
import { RequirePermission } from '../../../../common/decorators/require-permission.decorator';
import { MembresiaQueryService } from '../../application/services/membresia-query.service';
import { MembresiaCommandService } from '../../application/commands/membresia-command.service';
import { ListarMembresiasQueryDto } from '../dto/listar-membresias-query.dto';
import { ActualizarMembresiaDto } from '../dto/actualizar-membresia.dto';

/**
 * HU_13 (reemplaza HU_06): gestion administrativa de miembros del tenant del admin autenticado.
 * @SkipCsrf() a nivel de clase (deuda tecnica aceptada, decision 2026-08-23 -- ver CLAUDE.md,
 * "CSRF deshabilitado en endpoints de sesion real"). Quitar este decorator es el unico cambio
 * necesario si se revierte la decision.
 */
@Controller('rbac/membresias')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles('administrador')
@SkipCsrf()
export class MembresiasController {
  constructor(
    private readonly membresiaQueryService: MembresiaQueryService,
    private readonly membresiaCommandService: MembresiaCommandService,
  ) {}

  @Get()
  @RequirePermission('memberships:list')
  listar(@Query() query: ListarMembresiasQueryDto, @CurrentUser() user: JwtPayload) {
    return this.membresiaQueryService.listar(
      user.tenantId,
      { activo: query.activo },
      { pagina: query.pagina ?? 1, tamanioPagina: query.tamanioPagina ?? 20 },
    );
  }

  @Get(':id')
  @RequirePermission('memberships:read')
  obtener(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.membresiaQueryService.obtener(id, user.tenantId);
  }

  @Patch(':id')
  @RequirePermission('memberships:update')
  actualizar(
    @Param('id') id: string,
    @Body() dto: ActualizarMembresiaDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.membresiaCommandService.actualizar(id, user.tenantId, dto, user.sub);
  }

  @Delete(':id')
  @RequirePermission('memberships:deactivate')
  desactivar(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.membresiaCommandService.desactivar(id, user.tenantId, user.sub);
  }
}
