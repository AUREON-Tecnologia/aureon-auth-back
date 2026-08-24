import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser, JwtAuthGuard, JwtPayload, Roles, RolesGuard, SkipCsrf } from '@aureon/redis-client';
import { PermissionsGuard } from '../../../../common/guards/permissions.guard';
import { RequirePermission } from '../../../../common/decorators/require-permission.decorator';
import { RbacAdminService } from '../../application/services/rbac-admin.service';
import { CrearPermisoDto } from '../dto/crear-permiso.dto';
import { AsignarPermisoDirectoDto } from '../dto/asignar-permiso-directo.dto';

/**
 * Catalogo de permisos: GLOBAL (compartido por todos los tenants), ver CLAUDE.md.
 * @SkipCsrf() a nivel de clase (deuda tecnica aceptada, decision 2026-08-23 -- ver CLAUDE.md,
 * "CSRF deshabilitado en endpoints de sesion real"). Quitar este decorator es el unico cambio
 * necesario si se revierte la decision.
 */
@Controller('rbac/permisos')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles('administrador')
@SkipCsrf()
export class PermisosController {
  constructor(private readonly rbacAdminService: RbacAdminService) {}

  @Get()
  @RequirePermission('permissions:list')
  listar() {
    return this.rbacAdminService.listarPermisos();
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('permissions:create')
  crear(@Body() dto: CrearPermisoDto) {
    return this.rbacAdminService.crearPermiso(dto);
  }

  @Post('usuarios/:userId')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('permissions:assign-direct')
  async asignarDirecto(
    @Param('userId') userId: string,
    @Body() dto: AsignarPermisoDirectoDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<{ mensaje: string }> {
    await this.rbacAdminService.asignarPermisoDirecto(
      userId,
      user.tenantId,
      dto.permisoId,
      dto.effect,
      user.sub,
      dto.razon,
    );
    return { mensaje: 'Permiso directo asignado correctamente.' };
  }

  @Delete('usuarios/:userId/:permisoId')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('permissions:revoke-direct')
  async quitarDirecto(
    @Param('userId') userId: string,
    @Param('permisoId') permisoId: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<{ mensaje: string }> {
    await this.rbacAdminService.quitarPermisoDirecto(userId, user.tenantId, permisoId);
    return { mensaje: 'Permiso directo removido correctamente.' };
  }
}
