import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../../common/guards/roles.guard';
import { Roles } from '../../../../common/decorators/roles.decorator';
import { CurrentUser, JwtPayload } from '../../../../common/decorators/current-user.decorator';
import { RbacAdminService } from '../../application/services/rbac-admin.service';
import { CrearRolDto } from '../dto/crear-rol.dto';
import { AsignarPermisoRolDto } from '../dto/asignar-permiso-rol.dto';

@Controller('rbac/roles')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('administrador')
export class RolesController {
  constructor(private readonly rbacAdminService: RbacAdminService) {}

  @Get()
  listar(@CurrentUser() user: JwtPayload) {
    return this.rbacAdminService.listarRoles(user.tenantId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  crear(@Body() dto: CrearRolDto, @CurrentUser() user: JwtPayload) {
    return this.rbacAdminService.crearRol(user.tenantId, dto);
  }

  @Post(':id/permisos')
  @HttpCode(HttpStatus.OK)
  async asignarPermiso(
    @Param('id') rolId: string,
    @Body() dto: AsignarPermisoRolDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<{ mensaje: string }> {
    await this.rbacAdminService.asignarPermisoARol(rolId, dto.permisoId, user.sub);
    return { mensaje: 'Permiso asignado correctamente.' };
  }
}
