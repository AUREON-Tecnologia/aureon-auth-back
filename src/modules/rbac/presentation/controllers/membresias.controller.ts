import { Body, Controller, Delete, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../../common/guards/roles.guard';
import { Roles } from '../../../../common/decorators/roles.decorator';
import { CurrentUser, JwtPayload } from '../../../../common/decorators/current-user.decorator';
import { MembresiaQueryService } from '../../application/services/membresia-query.service';
import { MembresiaCommandService } from '../../application/commands/membresia-command.service';
import { ListarMembresiasQueryDto } from '../dto/listar-membresias-query.dto';
import { ActualizarMembresiaDto } from '../dto/actualizar-membresia.dto';

/** HU_13 (reemplaza HU_06): gestion administrativa de miembros del tenant del admin autenticado. */
@Controller('rbac/membresias')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('administrador')
export class MembresiasController {
  constructor(
    private readonly membresiaQueryService: MembresiaQueryService,
    private readonly membresiaCommandService: MembresiaCommandService,
  ) {}

  @Get()
  listar(@Query() query: ListarMembresiasQueryDto, @CurrentUser() user: JwtPayload) {
    return this.membresiaQueryService.listar(
      user.tenantId,
      { activo: query.activo },
      { pagina: query.pagina ?? 1, tamanioPagina: query.tamanioPagina ?? 20 },
    );
  }

  @Get(':id')
  obtener(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.membresiaQueryService.obtener(id, user.tenantId);
  }

  @Patch(':id')
  actualizar(
    @Param('id') id: string,
    @Body() dto: ActualizarMembresiaDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.membresiaCommandService.actualizar(id, user.tenantId, dto, user.sub);
  }

  @Delete(':id')
  desactivar(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.membresiaCommandService.desactivar(id, user.tenantId, user.sub);
  }
}
