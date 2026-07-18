import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query, UseGuards } from '@nestjs/common';
import { PlatformBootstrapGuard } from '../../../../common/guards/platform-bootstrap.guard';
import { TenantCommandService } from '../../application/commands/tenant-command.service';
import { TenantQueryService } from '../../application/queries/tenant-query.service';
import { CrearTenantDto } from '../dto/crear-tenant.dto';
import { ListarTenantsQueryDto } from '../dto/listar-tenants-query.dto';

/** HU_13: no existe un rol "super-admin de plataforma" en el schema — se protege con un secreto compartido. */
@Controller('tenants')
@UseGuards(PlatformBootstrapGuard)
export class TenantsController {
  constructor(
    private readonly tenantCommandService: TenantCommandService,
    private readonly tenantQueryService: TenantQueryService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  crear(@Body() dto: CrearTenantDto) {
    return this.tenantCommandService.crear(dto);
  }

  @Get()
  listar(@Query() query: ListarTenantsQueryDto) {
    return this.tenantQueryService.listar({
      pagina: query.pagina ?? 1,
      tamanioPagina: query.tamanioPagina ?? 20,
    });
  }

  @Get(':id')
  obtener(@Param('id') id: string) {
    return this.tenantQueryService.obtener(id);
  }
}
