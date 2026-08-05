import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Ip, Post, UseGuards } from '@nestjs/common';
import { AuthCommandService } from '../../application/commands/auth-command.service';
import { AuthQueryService } from '../../application/queries/auth-query.service';
import { CurrentUser, JwtPayload } from '../../../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../../../common/guards/jwt-auth.guard';
import { LoginDto } from '../dto/login.dto';
import { RefreshDto } from '../dto/refresh.dto';
import { RegisterDto } from '../dto/register.dto';
import { LogoutDto } from '../dto/logout.dto';
import { LoginResponseDto } from '../dto/login-response.dto';
import { UsuarioAutenticadoDto } from '../dto/usuario-autenticado.dto';
import { toLoginResponseDto } from '../mappers/login-response.mapper';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authCommandService: AuthCommandService,
    private readonly authQueryService: AuthQueryService,
  ) {}

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(
    @Body() dto: RegisterDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent?: string,
  ): Promise<LoginResponseDto> {
    const resultado = await this.authCommandService.register(dto, { ip, userAgent });
    return toLoginResponseDto(resultado);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent?: string,
  ): Promise<LoginResponseDto> {
    const resultado = await this.authCommandService.login(dto.email, dto.password, dto.tenantCode, {
      ip,
      userAgent,
    });
    return toLoginResponseDto(resultado);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Body() dto: RefreshDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent?: string,
  ): Promise<LoginResponseDto> {
    const resultado = await this.authCommandService.refresh(dto.refreshToken, { ip, userAgent });
    return toLoginResponseDto(resultado);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  logout(
    @Body() dto: LogoutDto,
    @Headers('authorization') authHeader?: string,
  ): Promise<{ mensaje: string }> {
    const accessToken = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : undefined;
    return this.authCommandService.logout(dto.refreshToken, accessToken);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@CurrentUser() user: JwtPayload): Promise<UsuarioAutenticadoDto> {
    const usuario = await this.authQueryService.getById(user.sub);
    return UsuarioAutenticadoDto.desde(usuario, user.tenantId, user.roles[0] ?? '');
  }
}
