import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import { PlatformBootstrapGuard } from '../../../../common/guards/platform-bootstrap.guard';
import { CurrentUser, JwtAuthGuard, JwtPayload, Roles, RolesGuard, SkipCsrf } from '@aureon/redis-client';
import { ModulosService } from '../../application/services/modulos.service';
import { CrearModuloDto } from '../dto/crear-modulo.dto';

/**
 * HU_13: crear modulos nuevos en el catalogo GLOBAL es una operacion de
 * plataforma (protegida por el mismo secreto que POST /tenants) — un admin de
 * tenant solo puede ver el catalogo y activar/desactivar modulos para su propio
 * tenant (rutas bajo /rbac/modulos-tenant), nunca crear modulos nuevos.
 */
@Controller()
export class ModulosController {
  constructor(private readonly modulosService: ModulosService) {}

  @Post('modulos')
  @UseGuards(PlatformBootstrapGuard)
  // Bootstrap por secreto, no por cookie de sesion -- una csrf_token vieja de otra sesion no debe
  // poder bloquear esto (mismo hallazgo 2026-08-23 que TenantsController/PlatformAdminsController).
  @SkipCsrf()
  @HttpCode(HttpStatus.CREATED)
  crear(@Body() dto: CrearModuloDto) {
    return this.modulosService.crearModulo(dto);
  }

  @Get('modulos')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('administrador')
  listarCatalogo() {
    return this.modulosService.listarModulos();
  }

  @Get('rbac/modulos-tenant')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('administrador')
  listarDeTenant(@CurrentUser() user: JwtPayload) {
    return this.modulosService.listarModulosDeTenant(user.tenantId);
  }

  @Post('rbac/modulos-tenant/:moduloId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('administrador')
  // Deuda tecnica aceptada, decision 2026-08-23 (ver CLAUDE.md, "CSRF deshabilitado en endpoints
  // de sesion real"). Quitar este decorator es el unico cambio necesario si se revierte.
  @SkipCsrf()
  @HttpCode(HttpStatus.OK)
  activar(@Param('moduloId') moduloId: string, @CurrentUser() user: JwtPayload) {
    return this.modulosService.activarModuloParaTenant(user.tenantId, moduloId);
  }

  @Delete('rbac/modulos-tenant/:moduloId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('administrador')
  // Deuda tecnica aceptada, decision 2026-08-23 (ver CLAUDE.md, "CSRF deshabilitado en endpoints
  // de sesion real"). Quitar este decorator es el unico cambio necesario si se revierte.
  @SkipCsrf()
  @HttpCode(HttpStatus.OK)
  async desactivar(
    @Param('moduloId') moduloId: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<{ mensaje: string }> {
    await this.modulosService.desactivarModuloParaTenant(user.tenantId, moduloId);
    return { mensaje: 'Modulo desactivado para el tenant.' };
  }
}
