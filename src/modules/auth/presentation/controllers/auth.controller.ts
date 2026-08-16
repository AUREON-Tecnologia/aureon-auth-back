import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Ip,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthCommandService } from '../../application/commands/auth-command.service';
import { AuthQueryService } from '../../application/queries/auth-query.service';
import {
  ACCESS_TOKEN_COOKIE_NAME,
  CurrentUser,
  JwtAuthGuard,
  JwtPayload,
  REFRESH_TOKEN_COOKIE_NAME,
} from '@aureon/redis-client';
import { CookieService } from '../../../../common/services/cookie.service';
import { LoginDto } from '../dto/login.dto';
import { RefreshDto } from '../dto/refresh.dto';
import { RegisterDto } from '../dto/register.dto';
import { LogoutDto } from '../dto/logout.dto';
import { LoginResponseDto } from '../dto/login-response.dto';
import { AuthenticatedUserDto } from '../dto/authenticated-user.dto';
import { toLoginResponseDto } from '../mappers/login-response.mapper';

type RequestWithCookies = Request & { cookies?: Record<string, string | undefined> };

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authCommandService: AuthCommandService,
    private readonly authQueryService: AuthQueryService,
    private readonly cookieService: CookieService,
  ) {}

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(
    @Body() dto: RegisterDto,
    @Ip() ip: string,
    @Res({ passthrough: true }) res: Response,
    @Headers('user-agent') userAgent?: string,
  ): Promise<LoginResponseDto> {
    const resultado = await this.authCommandService.register(
      {
        email: dto.email,
        password: dto.password,
        tenantCode: dto.tenantCode,
        primerNombre: dto.firstName,
        apellido: dto.lastName,
      },
      { ip, userAgent },
    );
    this.cookieService.setSessionCookies(res, resultado);
    return toLoginResponseDto(resultado);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Ip() ip: string,
    @Res({ passthrough: true }) res: Response,
    @Headers('user-agent') userAgent?: string,
  ): Promise<LoginResponseDto> {
    const resultado = await this.authCommandService.login(dto.email, dto.password, dto.tenantCode, {
      ip,
      userAgent,
    });
    this.cookieService.setSessionCookies(res, resultado);
    return toLoginResponseDto(resultado);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Body() dto: RefreshDto,
    @Ip() ip: string,
    @Req() req: RequestWithCookies,
    @Res({ passthrough: true }) res: Response,
    @Headers('user-agent') userAgent?: string,
  ): Promise<LoginResponseDto> {
    const refreshToken = req.cookies?.[REFRESH_TOKEN_COOKIE_NAME] ?? dto.refreshToken;
    if (!refreshToken) {
      throw new BadRequestException({
        codigo: 'BAD_REQUEST',
        mensaje: 'Missing refreshToken (cookie or body)',
      });
    }
    const resultado = await this.authCommandService.refresh(refreshToken, { ip, userAgent });
    this.cookieService.setSessionCookies(res, resultado);
    return toLoginResponseDto(resultado);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @Body() dto: LogoutDto,
    @Req() req: RequestWithCookies,
    @Res({ passthrough: true }) res: Response,
    @Headers('authorization') authHeader?: string,
  ): Promise<{ message: string }> {
    const refreshToken = req.cookies?.[REFRESH_TOKEN_COOKIE_NAME] ?? dto.refreshToken;
    if (!refreshToken) {
      throw new BadRequestException({
        codigo: 'BAD_REQUEST',
        mensaje: 'Missing refreshToken (cookie or body)',
      });
    }
    const accessToken =
      (authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : undefined) ??
      req.cookies?.[ACCESS_TOKEN_COOKIE_NAME];
    this.cookieService.clearSessionCookies(res);
    return this.authCommandService.logout(refreshToken, accessToken);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@CurrentUser() user: JwtPayload): Promise<AuthenticatedUserDto> {
    const usuario = await this.authQueryService.getById(user.sub);
    return AuthenticatedUserDto.desde(usuario, user.tenantId, user.roles[0] ?? '');
  }
}
