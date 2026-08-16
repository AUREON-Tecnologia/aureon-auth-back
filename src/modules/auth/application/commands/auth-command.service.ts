import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AccessTokenSessionWriterService, RedisUnavailableError } from '@aureon/redis-client';
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

export interface SessionContext {
  ip?: string;
  userAgent?: string;
}

export interface AuthSessionResult {
  user: Usuario;
  tenantId: string;
  roleCode: string;
  permissions: string[];
  activeModules: string[];
  accessToken: string;
  accessTokenExpiresAt: Date;
  refreshToken: string;
  refreshExpiresAt: Date;
}

const INVALID_CREDENTIALS_MESSAGE = 'Invalid credentials';

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
    private readonly accessTokenSession: AccessTokenSessionWriterService,
  ) {}

  /**
   * Solo crea usuarios globales nuevos — si el email ya existe (en este u otro
   * tenant), responde 409. Sumar un tenant adicional a una cuenta existente no se
   * expone via auto-registro publico en esta ronda (requeriria probar posesion de
   * la cuenta primero); queda como flujo futuro autenticado, no publico.
   */
  async register(input: RegisterInput, context?: SessionContext): Promise<AuthSessionResult> {
    const tenant = await this.tenantRepository.findByCode(input.tenantCode);
    if (!tenant || !tenant.activo) {
      throw new NotFoundException({ codigo: 'TENANT_NOT_FOUND', mensaje: 'Tenant not found or inactive' });
    }

    const existente = await this.authRepository.findByEmail(input.email);
    if (existente) {
      throw new ConflictException({ codigo: 'USER_ALREADY_EXISTS', mensaje: 'A user with that email already exists' });
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

    return this.emitirSesion(user, tenant.id, codigoRolDefault, context);
  }

  async login(
    email: string,
    password: string,
    tenantCode: string,
    context?: SessionContext,
  ): Promise<AuthSessionResult> {
    const maxIntentos = this.configService.get<number>('security.maxIntentosFallidos') ?? 5;
    const minutosBloqueo = this.configService.get<number>('security.bloqueoMinutos') ?? 15;

    const tenant = await this.tenantRepository.findByCode(tenantCode);
    if (!tenant || !tenant.activo) {
      throw new UnauthorizedException({ codigo: 'INVALID_CREDENTIALS', mensaje: INVALID_CREDENTIALS_MESSAGE });
    }

    const user = await this.authRepository.findByEmail(email);
    if (!user) {
      this.auditLog.registrar({ evento: 'LOGIN_FALLIDO', email, tenantId: tenant.id, detalle: { motivo: 'no_existe' } });
      throw new UnauthorizedException({ codigo: 'INVALID_CREDENTIALS', mensaje: INVALID_CREDENTIALS_MESSAGE });
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
      throw new UnauthorizedException({ codigo: 'INVALID_CREDENTIALS', mensaje: INVALID_CREDENTIALS_MESSAGE });
    }

    const userWithHash = await this.authRepository.findByEmailWithPassword(email);
    const passwordOk = userWithHash?.passwordHash
      ? await bcrypt.compare(password, userWithHash.passwordHash)
      : false;

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
      throw new UnauthorizedException({ codigo: 'INVALID_CREDENTIALS', mensaje: INVALID_CREDENTIALS_MESSAGE });
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
      throw new UnauthorizedException({ codigo: 'INVALID_CREDENTIALS', mensaje: INVALID_CREDENTIALS_MESSAGE });
    }

    await this.authRepository.registrarLoginExitoso(user.id);
    this.auditLog.registrar({ evento: 'LOGIN_EXITOSO', usuarioId: user.id, email, tenantId: tenant.id });
    return this.emitirSesion(user, tenant.id, membresia.rol.codigo, context);
  }

  async refresh(refreshToken: string, context?: SessionContext): Promise<AuthSessionResult> {
    const hash = this.tokenService.hashToken(refreshToken);
    const sesion = await this.sessionRepository.findByTokenHash(hash);

    if (!sesion || !sesion.activa || sesion.expiraEn.getTime() <= Date.now()) {
      throw new UnauthorizedException({
        codigo: 'INVALID_CREDENTIALS',
        mensaje: 'Refresh token invalid, expired, or already used',
      });
    }

    const user = await this.authRepository.findById(sesion.userId);
    if (!user || !user.puedeAutenticar) {
      await this.sessionRepository.invalidate(sesion.id);
      throw new UnauthorizedException({ codigo: 'INVALID_CREDENTIALS', mensaje: 'User not found or inactive' });
    }

    if (user.bloqueadoHasta && user.bloqueadoHasta.getTime() > Date.now()) {
      throw new CuentaBloqueadaException(user.bloqueadoHasta);
    }

    const membresia = await this.rbacRepository.buscarMembresia(user.id, sesion.tenantId);
    if (!membresia || !membresia.activo || !membresia.rol) {
      await this.sessionRepository.invalidate(sesion.id);
      throw new UnauthorizedException({ codigo: 'INVALID_CREDENTIALS', mensaje: 'Membership inactive or nonexistent' });
    }

    // Rotacion: el refresh token usado queda invalidado se use o no una nueva sesion despues.
    await this.sessionRepository.invalidate(sesion.id);
    this.auditLog.registrar({ evento: 'REFRESH_TOKEN', usuarioId: user.id, tenantId: sesion.tenantId });
    return this.emitirSesion(user, sesion.tenantId, membresia.rol.codigo, context);
  }

  /**
   * accessToken es opcional (header Authorization de quien llama, si lo manda):
   * se usa solo para borrar de inmediato su sesion en Redis (whitelist), en
   * vez de esperar a que expire por TTL. El cierre de sesion en si (invalidar
   * el refresh token en Postgres) no depende de el y funciona igual sin el,
   * como hasta ahora.
   */
  async logout(refreshToken: string, accessToken?: string): Promise<{ message: string }> {
    const hash = this.tokenService.hashToken(refreshToken);
    const sesion = await this.sessionRepository.findByTokenHash(hash);

    if (sesion && sesion.activa) {
      await this.sessionRepository.invalidate(sesion.id);
      this.auditLog.registrar({ evento: 'LOGOUT', usuarioId: sesion.userId, tenantId: sesion.tenantId });
    }

    await this.deleteAccessTokenSessionIfPresent(accessToken);

    // Idempotente por contrato: cerrar sesion con un refresh token ya invalidado tambien responde 200.
    return { message: 'Session closed successfully.' };
  }

  private async deleteAccessTokenSessionIfPresent(accessToken?: string): Promise<void> {
    if (!accessToken) {
      return;
    }
    const payload = this.tokenService.decodeForLogout(accessToken);
    if (!payload?.jti) {
      return;
    }
    await this.accessTokenSession.deleteSession(payload.jti);
  }

  private async emitirSesion(
    user: Usuario,
    tenantId: string,
    roleCode: string,
    context?: SessionContext,
  ): Promise<AuthSessionResult> {
    const [permissions, activeModules] = await Promise.all([
      this.rbacRepository.permisosEfectivos(user.id, tenantId),
      this.rbacRepository.listActiveModulesForTenant(tenantId),
    ]);

    const accessTokenPayload = {
      sub: user.id,
      tenantId,
      email: user.email,
      roles: [roleCode],
      permissions,
      activeModules,
    };
    const { token: accessToken, expiresAt: accessTokenExpiresAt, jti } =
      this.tokenService.generateAccessToken(accessTokenPayload);

    const ttlSeconds = Math.floor((accessTokenExpiresAt.getTime() - Date.now()) / 1000);
    try {
      await this.accessTokenSession.saveSession(jti, { ...accessTokenPayload, jti }, ttlSeconds);
    } catch (error) {
      if (error instanceof RedisUnavailableError) {
        throw new ServiceUnavailableException({
          codigo: 'AUTH_BACKEND_UNAVAILABLE',
          mensaje: 'Could not register the access token session',
        });
      }
      throw error;
    }

    const { token: refreshToken, hash } = this.tokenService.generateOpaqueToken();
    const refreshDays = this.configService.get<number>('security.refreshExpiresInDias') ?? 30;
    const refreshExpiresAt = new Date(Date.now() + refreshDays * 24 * 60 * 60 * 1000);

    await this.sessionRepository.create({
      userId: user.id,
      tenantId,
      tokenHash: hash,
      expiraEn: refreshExpiresAt,
      userAgent: context?.userAgent ?? null,
      ipAddress: context?.ip ?? null,
    });

    return {
      user,
      tenantId,
      roleCode,
      permissions,
      activeModules,
      accessToken,
      accessTokenExpiresAt,
      refreshToken,
      refreshExpiresAt,
    };
  }
}
