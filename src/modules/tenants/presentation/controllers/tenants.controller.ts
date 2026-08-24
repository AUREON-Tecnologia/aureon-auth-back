import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query, UseGuards } from '@nestjs/common';
import { SkipCsrf } from '@aureon/redis-client';
import { PlatformBootstrapGuard } from '../../../../common/guards/platform-bootstrap.guard';
import { TenantCommandService } from '../../application/commands/tenant-command.service';
import { TenantQueryService } from '../../application/queries/tenant-query.service';
import { CrearTenantDto } from '../dto/crear-tenant.dto';
import { ListarTenantsQueryDto } from '../dto/listar-tenants-query.dto';

/**
 * HU_13: no existe un rol "super-admin de plataforma" en el schema — se protege con un secreto compartido.
 * @SkipCsrf() a nivel de clase (hallazgo 2026-08-23, mismo que /platform/admins): esta ruta se
 * autentica por X-Platform-Bootstrap-Key, nunca por cookie de sesion -- una csrf_token vieja de
 * OTRA sesion (Postman u otro navegador) no tiene por que poder bloquear una operacion de bootstrap
 * que ni siquiera usa cookies para autenticarse.
 */
@Controller('tenants')
@UseGuards(PlatformBootstrapGuard)
@SkipCsrf()
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
