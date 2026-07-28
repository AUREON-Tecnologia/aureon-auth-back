import { ConflictException, Inject, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import {
  AUTH_REPOSITORY,
  IAuthRepository,
} from '../../domain/repositories/auth.repository.interface';
import {
  SESSION_REPOSITORY,
  ISessionRepository,
} from '../../domain/repositories/session.repository.interface';
import { Usuario } from '../../domain/entities/usuario.entity';
import { TokenService } from '../services/token.service';
import { AuditLogService } from '../../../../common/services/audit-log.service';
import { CuentaBloqueadaException } from '../../../../common/exceptions/cuenta-bloqueada.exception';
import { IRbacRepository, RBAC_REPOSITORY } from '../../../rbac/domain/repositories/rbac.repository.interface';
import { ITenantRepository, TENANT_REPOSITORY } from '../../../tenants/domain/repositories/tenant.repository.interface';

export interface RegisterInput {
  email: string;
  password: string;
  tenantCode: string;
  primerNombre?: string;
  apellido?: string;
}

export interface ContextoSesion {
  ip?: string;
  userAgent?: string;
}

export interface AuthSessionResult {
  usuario: Usuario;
  tenantId: string;
  rolCodigo: string;
  permisos: string[];
  accessToken: string;
  accessTokenExpiraEn: Date;
  refreshToken: string;
  refreshExpiraEn: Date;
}

const MENSAJE_CREDENCIALES_INVALIDAS = 'Credenciales invalidas';

@Injectable()
export class AuthCommandService {
  private static readonly BCRYPT_ROUNDS = 10;

  constructor(
    @Inject(AUTH_REPOSITORY) private readonly authRepository: IAuthRepository,
    @Inject(SESSION_REPOSITORY) private readonly sessionRepository: ISessionRepository,
    @Inject(RBAC_REPOSITORY) private readonly rbacRepository: IRbacRepository,
    @Inject(TENANT_REPOSITORY) private readonly tenantRepository: ITenantRepository,
    private readonly tokenService: TokenService,
    private readonly configService: ConfigService,
    private readonly auditLog: AuditLogService,
  ) {}

  /**
   * Solo crea usuarios globales nuevos — si el email ya existe (en este u otro
   * tenant), responde 409. Sumar un tenant adicional a una cuenta existente no se
   * expone via auto-registro publico en esta ronda (requeriria probar posesion de
   * la cuenta primero); queda como flujo futuro autenticado, no publico.
   */
  async register(input: RegisterInput, contexto?: ContextoSesion): Promise<AuthSessionResult> {
    const tenant = await this.tenantRepository.findByCode(input.tenantCode);
    if (!tenant || !tenant.activo) {
      throw new NotFoundException({ codigo: 'TENANT_NOT_FOUND', mensaje: 'Tenant no encontrado o inactivo' });
    }

    const existente = await this.authRepository.findByEmail(input.email);
    if (existente) {
      throw new ConflictException({ codigo: 'USER_ALREADY_EXISTS', mensaje: 'Ya existe un usuario con ese email' });
    }

    const passwordHash = await bcrypt.hash(input.password, AuthCommandService.BCRYPT_ROUNDS);
    const user = await this.authRepository.create({
      email: input.email,
      passwordHash,
      primerNombre: input.primerNombre ?? null,
      apellido: input.apellido ?? null,
    });
    this.auditLog.registrar({ evento: 'USUARIO_CREADO', usuarioId: user.id, tenantId: tenant.id, email: user.email });

    const codigoRolDefault = this.configService.get<string>('platform.defaultRoleCodeRegistro') ?? 'cliente';
    const rolDefault = await this.rbacRepository.buscarRolPorCodigo(tenant.id, codigoRolDefault);
    if (!rolDefault) {
      throw new Error(
        `El rol por defecto de autoregistro ("${codigoRolDefault}") no existe en el tenant ${tenant.id}`,
      );
    }
    await this.rbacRepository.crearMembresia({ userId: user.id, tenantId: tenant.id, rolId: rolDefault.id });

    return this.emitirSesion(user, tenant.id, codigoRolDefault, contexto);
  }

  async login(
    email: string,
    password: string,
    tenantCode: string,
    contexto?: ContextoSesion,
  ): Promise<AuthSessionResult> {
    const maxIntentos = this.configService.get<number>('security.maxIntentosFallidos') ?? 5;
    const minutosBloqueo = this.configService.get<number>('security.bloqueoMinutos') ?? 15;

    const tenant = await this.tenantRepository.findByCode(tenantCode);
    if (!tenant || !tenant.activo) {
      throw new UnauthorizedException({ codigo: 'INVALID_CREDENTIALS', mensaje: MENSAJE_CREDENCIALES_INVALIDAS });
    }

    const user = await this.authRepository.findByEmail(email);
    if (!user) {
      this.auditLog.registrar({ evento: 'LOGIN_FALLIDO', email, tenantId: tenant.id, detalle: { motivo: 'no_existe' } });
      throw new UnauthorizedException({ codigo: 'INVALID_CREDENTIALS', mensaje: MENSAJE_CREDENCIALES_INVALIDAS });
    }

    // failed_login_attempts/locked_until son globales al usuario (no por tenant, ver CLAUDE.md).
    if (user.bloqueadoHasta && user.bloqueadoHasta.getTime() > Date.now()) {
      this.auditLog.registrar({ evento: 'CUENTA_BLOQUEADA', usuarioId: user.id, email, tenantId: tenant.id });
      throw new CuentaBloqueadaException(user.bloqueadoHasta);
    }

    if (!user.puedeAutenticar) {
      this.auditLog.registrar({
        evento: 'LOGIN_FALLIDO',
        usuarioId: user.id,
        email,
        tenantId: tenant.id,
        detalle: { motivo: 'inactivo' },
      });
      throw new UnauthorizedException({ codigo: 'INVALID_CREDENTIALS', mensaje: MENSAJE_CREDENCIALES_INVALIDAS });
    }

    const userWithHash = await this.authRepository.findByEmailWithPassword(email);
    const passwordOk = userWithHash ? await bcrypt.compare(password, userWithHash.passwordHash) : false;

    if (!passwordOk) {
      const nuevosIntentos = user.intentosFallidos + 1;
      if (nuevosIntentos >= maxIntentos) {
        const bloqueadoHasta = new Date(Date.now() + minutosBloqueo * 60_000);
        await this.authRepository.registrarIntentoFallido(user.id, nuevosIntentos, bloqueadoHasta);
        this.auditLog.registrar({ evento: 'CUENTA_BLOQUEADA', usuarioId: user.id, email, tenantId: tenant.id });
        throw new CuentaBloqueadaException(bloqueadoHasta);
      }
      await this.authRepository.registrarIntentoFallido(user.id, nuevosIntentos, null);
      this.auditLog.registrar({
        evento: 'LOGIN_FALLIDO',
        usuarioId: user.id,
        email,
        tenantId: tenant.id,
        detalle: { motivo: 'password_incorrecta' },
      });
      throw new UnauthorizedException({ codigo: 'INVALID_CREDENTIALS', mensaje: MENSAJE_CREDENCIALES_INVALIDAS });
    }

    // La password es correcta: solo ahora se revela si pertenece o no al tenant (mismo mensaje genérico si no).
    const membresia = await this.rbacRepository.buscarMembresia(user.id, tenant.id);
    if (!membresia || !membresia.activo || !membresia.rol) {
      this.auditLog.registrar({
        evento: 'LOGIN_FALLIDO',
        usuarioId: user.id,
        email,
        tenantId: tenant.id,
        detalle: { motivo: 'sin_membresia' },
      });
      throw new UnauthorizedException({ codigo: 'INVALID_CREDENTIALS', mensaje: MENSAJE_CREDENCIALES_INVALIDAS });
    }

    await this.authRepository.registrarLoginExitoso(user.id);
    this.auditLog.registrar({ evento: 'LOGIN_EXITOSO', usuarioId: user.id, email, tenantId: tenant.id });
    return this.emitirSesion(user, tenant.id, membresia.rol.codigo, contexto);
  }

  async refresh(refreshToken: string, contexto?: ContextoSesion): Promise<AuthSessionResult> {
    const hash = this.tokenService.hashToken(refreshToken);
    const sesion = await this.sessionRepository.findByTokenHash(hash);

    if (!sesion || !sesion.activa || sesion.expiraEn.getTime() <= Date.now()) {
      throw new UnauthorizedException({
        codigo: 'INVALID_CREDENTIALS',
        mensaje: 'Refresh token invalido, expirado o ya utilizado',
      });
    }

    const user = await this.authRepository.findById(sesion.userId);
    if (!user || !user.puedeAutenticar) {
      await this.sessionRepository.invalidate(sesion.id);
      throw new UnauthorizedException({ codigo: 'INVALID_CREDENTIALS', mensaje: 'Usuario no encontrado o inactivo' });
    }

    if (user.bloqueadoHasta && user.bloqueadoHasta.getTime() > Date.now()) {
      throw new CuentaBloqueadaException(user.bloqueadoHasta);
    }

    const membresia = await this.rbacRepository.buscarMembresia(user.id, sesion.tenantId);
    if (!membresia || !membresia.activo || !membresia.rol) {
      await this.sessionRepository.invalidate(sesion.id);
      throw new UnauthorizedException({ codigo: 'INVALID_CREDENTIALS', mensaje: 'Membresia inactiva o inexistente' });
    }

    // Rotacion: el refresh token usado queda invalidado se use o no una nueva sesion despues.
    await this.sessionRepository.invalidate(sesion.id);
    this.auditLog.registrar({ evento: 'REFRESH_TOKEN', usuarioId: user.id, tenantId: sesion.tenantId });
    return this.emitirSesion(user, sesion.tenantId, membresia.rol.codigo, contexto);
  }

  async logout(refreshToken: string): Promise<{ mensaje: string }> {
    const hash = this.tokenService.hashToken(refreshToken);
    const sesion = await this.sessionRepository.findByTokenHash(hash);

    if (sesion && sesion.activa) {
      await this.sessionRepository.invalidate(sesion.id);
      this.auditLog.registrar({ evento: 'LOGOUT', usuarioId: sesion.userId, tenantId: sesion.tenantId });
    }

    // Idempotente por contrato: revocar un refresh token ya revocado tambien responde 200.
    return { mensaje: 'Sesion cerrada correctamente.' };
  }

  private async emitirSesion(
    user: Usuario,
    tenantId: string,
    rolCodigo: string,
    contexto?: ContextoSesion,
  ): Promise<AuthSessionResult> {
    const { token: accessToken, expiraEn: accessTokenExpiraEn } = this.tokenService.generateAccessToken({
      sub: user.id,
      tenantId,
      email: user.email,
      roles: [rolCodigo],
    });

    const { token: refreshToken, hash } = this.tokenService.generateOpaqueToken();
    const refreshDias = this.configService.get<number>('security.refreshExpiresInDias') ?? 30;
    const refreshExpiraEn = new Date(Date.now() + refreshDias * 24 * 60 * 60 * 1000);

    await this.sessionRepository.create({
      userId: user.id,
      tenantId,
      tokenHash: hash,
      expiraEn: refreshExpiraEn,
      userAgent: contexto?.userAgent ?? null,
      ipAddress: contexto?.ip ?? null,
    });

    const permisos = await this.rbacRepository.permisosEfectivos(user.id, tenantId);

    return {
      usuario: user,
      tenantId,
      rolCodigo,
      permisos,
      accessToken,
      accessTokenExpiraEn,
      refreshToken,
      refreshExpiraEn,
    };
  }
}
