import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../../common/guards/roles.guard';
import { Roles } from '../../../../common/decorators/roles.decorator';
import { CurrentUser, JwtPayload } from '../../../../common/decorators/current-user.decorator';
import { RbacAdminService } from '../../application/services/rbac-admin.service';
import { CrearPermisoDto } from '../dto/crear-permiso.dto';
import { AsignarPermisoDirectoDto } from '../dto/asignar-permiso-directo.dto';

/** Catalogo de permisos: GLOBAL (compartido por todos los tenants), ver CLAUDE.md. */
@Controller('rbac/permisos')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('administrador')
export class PermisosController {
  constructor(private readonly rbacAdminService: RbacAdminService) {}

  @Get()
  listar() {
    return this.rbacAdminService.listarPermisos();
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  crear(@Body() dto: CrearPermisoDto) {
    return this.rbacAdminService.crearPermiso(dto);
  }

  @Post('usuarios/:userId')
  @HttpCode(HttpStatus.OK)
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
  async quitarDirecto(
    @Param('userId') userId: string,
    @Param('permisoId') permisoId: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<{ mensaje: string }> {
    await this.rbacAdminService.quitarPermisoDirecto(userId, user.tenantId, permisoId);
    return { mensaje: 'Permiso directo removido correctamente.' };
  }
}
