import { Body, Controller, Delete, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../../common/guards/roles.guard';
import { Roles } from '../../../../common/decorators/roles.decorator';
import { CurrentUser, JwtPayload } from '../../../../common/decorators/current-user.decorator';
import { resolverRolNegocio } from '../../../../common/domain/rol-negocio';
import { AuthQueryService } from '../../application/queries/auth-query.service';
import { UsuarioCommandService } from '../../application/commands/usuario-command.service';
import { Usuario } from '../../domain/entities/usuario.entity';
import { ListarUsuariosQueryDto } from '../dto/listar-usuarios-query.dto';
import { ActualizarUsuarioDto } from '../dto/actualizar-usuario.dto';
import { UsuarioAutenticadoDto } from '../dto/usuario-autenticado.dto';

/** HU_06: gestion administrativa de usuarios internos — exclusivo de `administrador`. */
@Controller('auth/usuarios')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('administrador')
export class UsuariosController {
  constructor(
    private readonly authQueryService: AuthQueryService,
    private readonly usuarioCommandService: UsuarioCommandService,
  ) {}

  @Get()
  async listar(@Query() query: ListarUsuariosQueryDto) {
    const { data, meta } = await this.authQueryService.listar(
      { email: query.email, activo: query.activo },
      { pagina: query.pagina ?? 1, tamanioPagina: query.tamanioPagina ?? 20 },
    );
    return { data: data.map((usuario) => this.aDto(usuario)), meta };
  }

  @Get(':id')
  async obtener(@Param('id') id: string): Promise<UsuarioAutenticadoDto> {
    const usuario = await this.authQueryService.getById(id);
    return this.aDto(usuario);
  }

  @Patch(':id')
  async actualizar(
    @Param('id') id: string,
    @Body() dto: ActualizarUsuarioDto,
    @CurrentUser() actor: JwtPayload,
  ): Promise<UsuarioAutenticadoDto> {
    const usuario = await this.usuarioCommandService.actualizar(id, dto, actor.sub);
    return this.aDto(usuario);
  }

  @Delete(':id')
  async desactivar(
    @Param('id') id: string,
    @CurrentUser() actor: JwtPayload,
  ): Promise<UsuarioAutenticadoDto> {
    const usuario = await this.usuarioCommandService.desactivar(id, actor.sub);
    return this.aDto(usuario);
  }

  private aDto(usuario: Usuario): UsuarioAutenticadoDto {
    return UsuarioAutenticadoDto.desde(usuario, resolverRolNegocio(usuario.rol?.nombre));
  }
}
