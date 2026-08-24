import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AccessTokenSessionReaderService,
  AccessTokenSessionWriterService,
  RedisService,
  RedisUnavailableError,
} from '@aureon/redis-client';
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
import { TENANT_SELECTION_TTL_SECONDS } from '../../../../common/services/cookie.service';
import { groupPermissionsByModule, PermissionsByModule } from '../../../../common/utils/group-permissions.util';
import { IRbacRepository, RBAC_REPOSITORY } from '../../../rbac/domain/repositories/rbac.repository.interface';
import { Membresia } from '../../../rbac/domain/entities/membresia.entity';
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

export interface TenantSummary {
  id: string;
  code: string;
  name: string;
}

export interface AuthSessionResult {
  user: Usuario;
  tenantId: string;
  roleCode: string;
  permissions: string[];
  /** Same permissions as `permissions`, grouped by module/resource for the LoginResponse body -- see group-permissions.util.ts. */
  permissionsByModule: PermissionsByModule;
  activeModules: string[];
  tenants: TenantSummary[];
  accessToken: string;
  accessTokenExpiresAt: Date;
  refreshToken: string;
  refreshExpiresAt: Date;
}

/**
 * Respuesta de AuthCommandService.login() (decision 2026-08-22) — login
 * nunca abre sesion por si mismo: valida credenciales y devuelve la lista
 * de tenants activos del usuario mas un selectionToken de corta vida para
 * completar la apertura de sesion en switchTenant().
 */
export interface LoginTenantsResult {
  tenants: TenantSummary[];
  selectionToken: string;
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
    private readonly accessTokenSessionReader: AccessTokenSessionReaderService,
    private readonly redisService: RedisService,
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

  /**
   * Nunca abre sesion (decision 2026-08-22, reemplaza los disenos
   * intermedios del 2026-08-15/08-22): solo valida credenciales y devuelve
   * la lista de tenants activos del usuario mas un selectionToken de corta
   * vida (Redis, 5 min, un solo uso). POST /auth/switch-tenant es quien
   * realmente abre la sesion -- con ese ticket justo despues de login, o
   * con una sesion ya existente para cambiar de tenant mas adelante. El
   * frontend siempre da ese segundo paso, incluso con un solo tenant
   * activo (auto-elegirlo sin mostrar UI es decision de front, no un
   * atajo de backend). Ver CLAUDE.md, "Seleccion de tenant en login".
   */
  async login(email: string, password: string, context?: SessionContext): Promise<LoginTenantsResult> {
    const maxIntentos = this.configService.get<number>('security.maxIntentosFallidos') ?? 5;
    const minutosBloqueo = this.configService.get<number>('security.bloqueoMinutos') ?? 15;

    const user = await this.authRepository.findByEmail(email);
    if (!user) {
      this.auditLog.registrar({ evento: 'LOGIN_FALLIDO', email, detalle: { motivo: 'no_existe' } });
      throw new UnauthorizedException({ codigo: 'INVALID_CREDENTIALS', mensaje: INVALID_CREDENTIALS_MESSAGE });
    }

    // failed_login_attempts/locked_until son globales al usuario (no por tenant, ver CLAUDE.md).
    if (user.bloqueadoHasta && user.bloqueadoHasta.getTime() > Date.now()) {
      this.auditLog.registrar({ evento: 'CUENTA_BLOQUEADA', usuarioId: user.id, email });
      throw new CuentaBloqueadaException(user.bloqueadoHasta);
    }

    if (!user.puedeAutenticar) {
      this.auditLog.registrar({
        evento: 'LOGIN_FALLIDO',
        usuarioId: user.id,
        email,
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
        this.auditLog.registrar({ evento: 'CUENTA_BLOQUEADA', usuarioId: user.id, email });
        throw new CuentaBloqueadaException(bloqueadoHasta);
      }
      await this.authRepository.registrarIntentoFallido(user.id, nuevosIntentos, null);
      this.auditLog.registrar({
        evento: 'LOGIN_FALLIDO',
        usuarioId: user.id,
        email,
        detalle: { motivo: 'password_incorrecta' },
      });
      throw new UnauthorizedException({ codigo: 'INVALID_CREDENTIALS', mensaje: INVALID_CREDENTIALS_MESSAGE });
    }

    // La password es correcta: solo ahora se revela si tiene o no algun tenant (mismo mensaje generico si no).
    const membresias = await this.rbacRepository.listarMembresiasActivasDeUsuario(user.id);
    const membresiasConRol = membresias.filter((m) => m.activo && m.rol);

    if (membresiasConRol.length === 0) {
      this.auditLog.registrar({
        evento: 'LOGIN_FALLIDO',
        usuarioId: user.id,
        email,
        detalle: { motivo: 'sin_membresia' },
      });
      throw new UnauthorizedException({ codigo: 'INVALID_CREDENTIALS', mensaje: INVALID_CREDENTIALS_MESSAGE });
    }

    await this.authRepository.registrarLoginExitoso(user.id);
    const tenants = await this.resolverTenants(membresiasConRol);
    const selectionToken = await this.issueSelectionTicket(user.id);
    this.auditLog.registrar({
      evento: 'LOGIN_TICKET_EMITIDO',
      usuarioId: user.id,
      email,
      detalle: { tenantsActivos: tenants.length },
    });
    return { tenants, selectionToken };
  }

  /**
   * Unica operacion que abre sesion (decision 2026-08-22). Dos modos,
   * resueltos automaticamente segun lo que llegue:
   *  - Modo ticket: sin sesion previa, justo despues de login -- resuelve
   *    el usuario via selectionToken (Redis, un solo uso).
   *  - Modo sesion: ya autenticado, cambiando a otro tenant -- resuelve el
   *    usuario via existingAccessToken (igual que JwtAuthGuard: verifica
   *    firma/expiracion y confirma contra la whitelist de Redis) e invalida
   *    de inmediato la sesion del tenant que se abandona.
   * En ambos casos, tenantCode debe ser una membresia activa real de este
   * usuario -- nunca solo un tenant existente.
   */
  async switchTenant(
    existingAccessToken: string | undefined,
    tenantCode: string,
    selectionToken: string | undefined,
    context?: SessionContext,
  ): Promise<AuthSessionResult> {
    const resolved = await this.resolveSwitchIdentity(existingAccessToken, selectionToken);

    const tenant = await this.tenantRepository.findByCode(tenantCode);
    if (!tenant || !tenant.activo) {
      throw new NotFoundException({ codigo: 'TENANT_NOT_FOUND', mensaje: 'Tenant not found or inactive' });
    }

    const user = await this.authRepository.findById(resolved.userId);
    if (!user || !user.puedeAutenticar) {
      throw new UnauthorizedException({ codigo: 'INVALID_CREDENTIALS', mensaje: INVALID_CREDENTIALS_MESSAGE });
    }

    const membresia = await this.rbacRepository.buscarMembresia(user.id, tenant.id);
    if (!membresia || !membresia.activo || !membresia.rol) {
      this.auditLog.registrar({
        evento: 'LOGIN_FALLIDO',
        usuarioId: user.id,
        email: user.email,
        detalle: { motivo: 'tenant_sin_membresia' },
      });
      throw new UnauthorizedException({ codigo: 'INVALID_CREDENTIALS', mensaje: INVALID_CREDENTIALS_MESSAGE });
    }

    if (resolved.previousSession) {
      await this.sessionRepository.invalidateAllForUserInTenant(user.id, resolved.previousSession.tenantId);
      await this.deleteAccessTokenSessionIfPresent(existingAccessToken);
      this.auditLog.registrar({
        evento: 'TENANT_CAMBIADO',
        usuarioId: user.id,
        tenantId: resolved.previousSession.tenantId,
        detalle: { nuevoTenantId: tenant.id },
      });
    }

    this.auditLog.registrar({ evento: 'LOGIN_EXITOSO', usuarioId: user.id, email: user.email, tenantId: tenant.id });
    return this.emitirSesion(user, tenant.id, membresia.rol.codigo, context);
  }

  /**
   * Intenta primero resolver por una sesion ya existente (Authorization o
   * cookie access_token, mismo chequeo que JwtAuthGuard: firma/expiracion
   * local + whitelist de Redis); si no hay token o es invalido/expirado,
   * cae al selectionToken. Un RedisUnavailableError de la whitelist SI se
   * propaga (fail-closed, igual que JwtAuthGuard) -- no se confunde con
   * "no hay sesion".
   */
  private async resolveSwitchIdentity(
    existingAccessToken: string | undefined,
    selectionToken: string | undefined,
  ): Promise<{ userId: string; previousSession?: { tenantId: string } }> {
    if (existingAccessToken) {
      try {
        const payload = await this.tokenService.verifyAccessToken(existingAccessToken);
        const session = await this.accessTokenSessionReader.getSession(payload.jti);
        if (session) {
          return { userId: payload.sub, previousSession: { tenantId: payload.tenantId } };
        }
      } catch (error) {
        if (error instanceof RedisUnavailableError) {
          throw error;
        }
        // Token invalido/expirado: no es una sesion utilizable, cae al selectionToken.
      }
    }

    if (selectionToken) {
      const userId = await this.consumeSelectionTicket(selectionToken);
      if (userId) {
        return { userId };
      }
    }

    throw new UnauthorizedException({
      codigo: 'INVALID_CREDENTIALS',
      mensaje: 'No valid session or selection token',
    });
  }

  /**
   * Emite un ticket de seleccion nuevo para el usuario, borrando el
   * anterior si existia (evita tickets viejos colgados). Dos keys en
   * Redis: token->userId (para resolver el ticket que llega) y
   * userId->token (para poder borrar el anterior al emitir uno nuevo).
   */
  private async issueSelectionTicket(userId: string): Promise<string> {
    const previousToken = await this.redisService.get(this.ticketUserKey(userId));
    if (previousToken) {
      await this.redisService.del(this.ticketTokenKey(previousToken));
    }

    const { token } = this.tokenService.generateOpaqueToken();
    await this.redisService.set(
      this.ticketTokenKey(token),
      JSON.stringify({ userId }),
      TENANT_SELECTION_TTL_SECONDS,
    );
    await this.redisService.set(this.ticketUserKey(userId), token, TENANT_SELECTION_TTL_SECONDS);
    return token;
  }

  /** De un solo uso: borra ambas keys al primer intento, sin importar si el tenantCode elegido termina siendo valido. */
  private async consumeSelectionTicket(token: string): Promise<string | null> {
    const raw = await this.redisService.get(this.ticketTokenKey(token));
    if (!raw) {
      return null;
    }
    const { userId } = JSON.parse(raw) as { userId: string };
    await this.redisService.del(this.ticketTokenKey(token));
    await this.redisService.del(this.ticketUserKey(userId));
    return userId;
  }

  private ticketTokenKey(token: string): string {
    return `tenant-selection:token:${token}`;
  }

  private ticketUserKey(userId: string): string {
    return `tenant-selection:user:${userId}`;
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
    const [permissions, activeModules, membresias, moduleCodeByPermission] = await Promise.all([
      this.rbacRepository.permisosEfectivos(user.id, tenantId),
      this.rbacRepository.listActiveModulesForTenant(tenantId),
      this.rbacRepository.listarMembresiasActivasDeUsuario(user.id),
      this.rbacRepository.getModuleCodesByPermission(),
    ]);
    const tenants = await this.resolverTenants(membresias);
    const permissionsByModule = groupPermissionsByModule(permissions, moduleCodeByPermission);

    const accessTokenPayload = {
      sub: user.id,
      tenantId,
      email: user.email,
      roles: [roleCode],
      permissions,
      activeModules,
      platformAdmin: user.isPlatformAdmin,
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
      permissionsByModule,
      activeModules,
      tenants,
      accessToken,
      accessTokenExpiresAt,
      refreshToken,
      refreshExpiresAt,
    };
  }

  private async resolverTenants(membresias: Membresia[]): Promise<TenantSummary[]> {
    const tenants = await Promise.all(
      membresias.map((m) => this.tenantRepository.findById(m.tenantId)),
    );
    return tenants
      .filter((t): t is NonNullable<typeof t> => Boolean(t))
      .map((t) => ({ id: t.id, code: t.codigo, name: t.nombre }));
  }
}
