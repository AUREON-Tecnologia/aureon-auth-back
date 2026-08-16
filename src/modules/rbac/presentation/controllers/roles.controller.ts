import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser, JwtAuthGuard, JwtPayload, Roles, RolesGuard } from '@aureon/redis-client';
import { PermissionsGuard } from '../../../../common/guards/permissions.guard';
import { RequirePermission } from '../../../../common/decorators/require-permission.decorator';
import { RbacAdminService } from '../../application/services/rbac-admin.service';
import { CrearRolDto } from '../dto/crear-rol.dto';
import { AsignarPermisoRolDto } from '../dto/asignar-permiso-rol.dto';

@Controller('rbac/roles')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles('administrador')
export class RolesController {
  constructor(private readonly rbacAdminService: RbacAdminService) {}

  @Get()
  @RequirePermission('roles:list')
  listar(@CurrentUser() user: JwtPayload) {
    return this.rbacAdminService.listarRoles(user.tenantId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('roles:create')
  crear(@Body() dto: CrearRolDto, @CurrentUser() user: JwtPayload) {
    return this.rbacAdminService.crearRol(user.tenantId, dto);
  }

  @Post(':id/permisos')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('roles:assign-permission')
  async asignarPermiso(
    @Param('id') rolId: string,
    @Body() dto: AsignarPermisoRolDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<{ mensaje: string }> {
    await this.rbacAdminService.asignarPermisoARol(rolId, dto.permisoId, user.sub);
    return { mensaje: 'Permiso asignado correctamente.' };
  }
}
