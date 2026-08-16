import { Test, TestingModule } from '@nestjs/testing';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { AccessTokenSessionWriterService, RedisUnavailableError } from '@aureon/redis-client';
import * as bcrypt from 'bcryptjs';
import { AuthCommandService } from '../../src/modules/auth/application/commands/auth-command.service';
import { TokenService } from '../../src/modules/auth/application/services/token.service';
import {
  AUTH_REPOSITORY,
  IAuthRepository,
} from '../../src/modules/auth/domain/repositories/auth.repository.interface';
import {
  SESSION_REPOSITORY,
  ISessionRepository,
} from '../../src/modules/auth/domain/repositories/session.repository.interface';
import { Sesion } from '../../src/modules/auth/domain/entities/sesion.entity';
import { Usuario } from '../../src/modules/auth/domain/entities/usuario.entity';
import {
  IRbacRepository,
  RBAC_REPOSITORY,
} from '../../src/modules/rbac/domain/repositories/rbac.repository.interface';
import { Membresia } from '../../src/modules/rbac/domain/entities/membresia.entity';
import { Rol } from '../../src/modules/rbac/domain/entities/rol.entity';
import {
  ITenantRepository,
  TENANT_REPOSITORY,
} from '../../src/modules/tenants/domain/repositories/tenant.repository.interface';
import { Tenant } from '../../src/modules/tenants/domain/entities/tenant.entity';
import { buildRbacRepositoryMock } from '../rbac/__helpers__/rbac-repository.mock';
import { AuditLogService } from '../../src/common/services/audit-log.service';
import { CuentaBloqueadaException } from '../../src/common/exceptions/cuenta-bloqueada.exception';

const SECRET = 'test-secret-key-must-be-long-enough-32-chars';
const MAX_INTENTOS = 5;
const BLOQUEO_MINUTOS = 15;
const TENANT_ID = 'tenant-uuid-1';
const ROL_ADMIN_ID = 'rol-admin-uuid';

const buildTenant = (overrides: Partial<Tenant> = {}): Tenant =>
  new Tenant(
    overrides.id ?? TENANT_ID,
    overrides.codigo ?? 'acme-corp',
    overrides.nombre ?? 'Acme Corp',
    overrides.activo ?? true,
    overrides.configuracion ?? {},
    overrides.fechaCreacion ?? new Date('2026-01-01'),
  );

const buildUsuario = (overrides: Partial<Usuario> = {}): Usuario =>
  new Usuario(
    overrides.id ?? 'usr-uuid-1',
    overrides.email ?? 'test@taller.com',
    overrides.primerNombre ?? 'Ana',
    overrides.apellido ?? 'Perez',
    overrides.emailVerificadoEn ?? null,
    overrides.activo ?? true,
    overrides.eliminadoEn ?? null,
    overrides.intentosFallidos ?? 0,
    overrides.bloqueadoHasta ?? null,
    overrides.ultimoAcceso ?? null,
    overrides.fechaCreacion ?? new Date('2026-01-01'),
  );

const buildUsuarioWithPassword = async (overrides: Partial<Usuario> = {}, password = 'Password123!') => {
  const base = buildUsuario(overrides);
  const hash = await bcrypt.hash(password, 4);
  return Object.assign(Object.create(base), base, { passwordHash: hash });
};

const buildRol = (overrides: Partial<Rol> = {}): Rol =>
  new Rol(
    overrides.id ?? ROL_ADMIN_ID,
    overrides.tenantId ?? TENANT_ID,
    overrides.codigo ?? 'administrador',
    overrides.nombre ?? 'administrador',
    overrides.descripcion ?? null,
    overrides.activo ?? true,
    overrides.esSistema ?? true,
  );

const buildMembresia = (overrides: Partial<Membresia> = {}): Membresia =>
  new Membresia(
    overrides.id ?? 'membresia-uuid-1',
    overrides.userId ?? 'usr-uuid-1',
    overrides.tenantId ?? TENANT_ID,
    overrides.rolId ?? ROL_ADMIN_ID,
    overrides.activo ?? true,
    overrides.fechaIngreso ?? new Date('2026-01-01'),
    overrides.fechaExpiracion ?? null,
    overrides.rol ?? buildRol(),
  );

const buildSesion = (overrides: Partial<Sesion> = {}): Sesion =>
  new Sesion(
    overrides.id ?? 'sesion-uuid-1',
    overrides.userId ?? 'usr-uuid-1',
    overrides.tenantId ?? TENANT_ID,
    overrides.expiraEn ?? new Date(Date.now() + 60_000),
    overrides.revocadaEn ?? null,
    overrides.userAgent ?? null,
    overrides.ipAddress ?? null,
    overrides.creadaEn ?? new Date(),
  );

describe('AuthCommandService', () => {
  let service: AuthCommandService;
  let authRepo: jest.Mocked<IAuthRepository>;
  let sessionRepo: jest.Mocked<ISessionRepository>;
  let rbacRepo: jest.Mocked<IRbacRepository>;
  let tenantRepo: jest.Mocked<ITenantRepository>;
  let tokenService: TokenService;
  let accessTokenSessionMock: { saveSession: jest.Mock; deleteSession: jest.Mock };

  beforeEach(async () => {
    accessTokenSessionMock = { saveSession: jest.fn(), deleteSession: jest.fn() };
    const authRepoMock: jest.Mocked<IAuthRepository> = {
      findById: jest.fn(),
      findByEmail: jest.fn(),
      findByEmailWithPassword: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      registrarLoginExitoso: jest.fn(),
      registrarIntentoFallido: jest.fn(),
      marcarEmailVerificado: jest.fn(),
      actualizarPassword: jest.fn(),
    };

    const sessionRepoMock: jest.Mocked<ISessionRepository> = {
      create: jest.fn(),
      findByTokenHash: jest.fn(),
      invalidate: jest.fn(),
      invalidateAllForUser: jest.fn(),
    };

    const rbacRepoMock = buildRbacRepositoryMock();

    const tenantRepoMock: jest.Mocked<ITenantRepository> = {
      crear: jest.fn(),
      findByCode: jest.fn().mockResolvedValue(buildTenant()),
      findById: jest.fn(),
      listar: jest.fn(),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          load: [
            () => ({
              jwt: { secret: SECRET, expiresIn: '1h' },
              security: {
                maxIntentosFallidos: MAX_INTENTOS,
                bloqueoMinutos: BLOQUEO_MINUTOS,
                refreshExpiresInDias: 30,
              },
              platform: { defaultRoleCodeRegistro: 'cliente' },
            }),
          ],
        }),
        JwtModule.registerAsync({
          imports: [ConfigModule],
          inject: [ConfigService],
          useFactory: (cfg: ConfigService) => ({
            secret: cfg.get<string>('jwt.secret'),
            signOptions: { expiresIn: '1h' },
          }),
        }),
      ],
      providers: [
        TokenService,
        AuthCommandService,
        { provide: AUTH_REPOSITORY, useValue: authRepoMock },
        { provide: SESSION_REPOSITORY, useValue: sessionRepoMock },
        { provide: RBAC_REPOSITORY, useValue: rbacRepoMock },
        { provide: TENANT_REPOSITORY, useValue: tenantRepoMock },
        { provide: AuditLogService, useValue: { registrar: jest.fn() } },
        { provide: AccessTokenSessionWriterService, useValue: accessTokenSessionMock },
      ],
    }).compile();

    service = moduleRef.get(AuthCommandService);
    authRepo = moduleRef.get(AUTH_REPOSITORY);
    sessionRepo = moduleRef.get(SESSION_REPOSITORY);
    rbacRepo = moduleRef.get(RBAC_REPOSITORY);
    tenantRepo = moduleRef.get(TENANT_REPOSITORY);
    tokenService = moduleRef.get(TokenService);
  });

  describe('register', () => {
    const validInput = {
      email: 'nuevo@taller.com',
      password: 'Password123!',
      tenantCode: 'acme-corp',
    };

    it('camino feliz: crea el usuario, la membresia con el rol por defecto, y abre sesion', async () => {
      authRepo.findByEmail.mockResolvedValue(null);
      const created = buildUsuario({ email: validInput.email });
      authRepo.create.mockImplementation(async (data) => {
        expect(data.passwordHash).toMatch(/^\$2[aby]\$/);
        expect(data.passwordHash).not.toBe(validInput.password);
        return created;
      });
      rbacRepo.buscarRolPorCodigo.mockResolvedValue(buildRol({ codigo: 'cliente' }));
      sessionRepo.create.mockResolvedValue(buildSesion());

      const result = await service.register(validInput);

      expect(result.accessToken.split('.')).toHaveLength(3);
      expect(result.refreshToken).toBeDefined();
      expect(result.user.email).toBe(validInput.email);
      expect(result.roleCode).toBe('cliente');
      expect(rbacRepo.crearMembresia).toHaveBeenCalledWith(
        expect.objectContaining({ userId: created.id, tenantId: TENANT_ID }),
      );
    });

    it('lanza ConflictException si el email ya existe (en cualquier tenant)', async () => {
      authRepo.findByEmail.mockResolvedValue(buildUsuario());
      await expect(service.register(validInput)).rejects.toThrow();
      expect(authRepo.create).not.toHaveBeenCalled();
    });

    it('lanza NotFoundException si el tenant no existe o esta inactivo', async () => {
      tenantRepo.findByCode.mockResolvedValue(null);
      await expect(service.register(validInput)).rejects.toThrow();
    });
  });

  describe('login', () => {
    const email = 'user@taller.com';
    const password = 'Password123!';
    const tenantCode = 'acme-corp';

    it('camino feliz: devuelve token y refresh cuando las credenciales y la membresia son validas', async () => {
      const user = buildUsuario({ email });
      const withHash = await buildUsuarioWithPassword({ email }, password);
      authRepo.findByEmail.mockResolvedValue(user);
      authRepo.findByEmailWithPassword.mockResolvedValue(withHash);
      rbacRepo.buscarMembresia.mockResolvedValue(buildMembresia({ userId: user.id }));
      sessionRepo.create.mockResolvedValue(buildSesion());

      const result = await service.login(email, password, tenantCode);

      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
      expect(result.roleCode).toBe('administrador');
      expect(authRepo.registrarLoginExitoso).toHaveBeenCalledWith(user.id);
      expect(accessTokenSessionMock.saveSession).toHaveBeenCalledWith(
        expect.stringMatching(/^[0-9a-f-]{36}$/),
        expect.objectContaining({ sub: user.id, tenantId: TENANT_ID }),
        expect.any(Number),
      );
    });

    it('lanza ServiceUnavailableException si no se puede registrar la sesion del access token en Redis', async () => {
      const user = buildUsuario({ email });
      const withHash = await buildUsuarioWithPassword({ email }, password);
      authRepo.findByEmail.mockResolvedValue(user);
      authRepo.findByEmailWithPassword.mockResolvedValue(withHash);
      rbacRepo.buscarMembresia.mockResolvedValue(buildMembresia({ userId: user.id }));
      accessTokenSessionMock.saveSession.mockRejectedValue(new RedisUnavailableError('Redis caido'));

      await expect(service.login(email, password, tenantCode)).rejects.toBeInstanceOf(ServiceUnavailableException);
    });

    it('lanza UnauthorizedException si el tenant no existe', async () => {
      tenantRepo.findByCode.mockResolvedValue(null);
      await expect(service.login(email, password, tenantCode)).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('lanza UnauthorizedException si el usuario no existe', async () => {
      authRepo.findByEmail.mockResolvedValue(null);
      await expect(service.login(email, password, tenantCode)).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('lanza UnauthorizedException y registra el intento fallido si la password es incorrecta', async () => {
      const user = buildUsuario({ email, intentosFallidos: 0 });
      authRepo.findByEmail.mockResolvedValue(user);
      const withHash = await buildUsuarioWithPassword({ email }, 'OtraPass123!');
      authRepo.findByEmailWithPassword.mockResolvedValue(withHash);

      await expect(service.login(email, password, tenantCode)).rejects.toBeInstanceOf(UnauthorizedException);
      expect(authRepo.registrarIntentoFallido).toHaveBeenCalledWith(user.id, 1, null);
    });

    it('lanza UnauthorizedException si el usuario no puede autenticar (inactivo/eliminado)', async () => {
      authRepo.findByEmail.mockResolvedValue(buildUsuario({ email, activo: false }));
      await expect(service.login(email, password, tenantCode)).rejects.toBeInstanceOf(UnauthorizedException);
      expect(authRepo.findByEmailWithPassword).not.toHaveBeenCalled();
    });

    it('bloquea la cuenta (423) al alcanzar el maximo de intentos fallidos', async () => {
      const user = buildUsuario({ email, intentosFallidos: MAX_INTENTOS - 1 });
      authRepo.findByEmail.mockResolvedValue(user);
      const withHash = await buildUsuarioWithPassword({ email }, 'OtraPass123!');
      authRepo.findByEmailWithPassword.mockResolvedValue(withHash);

      await expect(service.login(email, password, tenantCode)).rejects.toBeInstanceOf(CuentaBloqueadaException);
      expect(authRepo.registrarIntentoFallido).toHaveBeenCalledWith(user.id, MAX_INTENTOS, expect.any(Date));
    });

    it('rechaza con 423 sin comparar password si la cuenta ya esta bloqueada', async () => {
      const bloqueadoHasta = new Date(Date.now() + 60_000);
      authRepo.findByEmail.mockResolvedValue(buildUsuario({ email, bloqueadoHasta }));
      await expect(service.login(email, password, tenantCode)).rejects.toBeInstanceOf(CuentaBloqueadaException);
      expect(authRepo.findByEmailWithPassword).not.toHaveBeenCalled();
    });

    it('lanza UnauthorizedException si la password es correcta pero no tiene membresia en el tenant', async () => {
      const user = buildUsuario({ email });
      const withHash = await buildUsuarioWithPassword({ email }, password);
      authRepo.findByEmail.mockResolvedValue(user);
      authRepo.findByEmailWithPassword.mockResolvedValue(withHash);
      rbacRepo.buscarMembresia.mockResolvedValue(null);

      await expect(service.login(email, password, tenantCode)).rejects.toBeInstanceOf(UnauthorizedException);
      expect(authRepo.registrarLoginExitoso).not.toHaveBeenCalled();
    });
  });

  describe('refresh', () => {
    it('camino feliz: rota el refresh token y emite un access token nuevo', async () => {
      const user = buildUsuario();
      const { token, hash } = tokenService.generateOpaqueToken();
      const sesion = buildSesion({ userId: user.id });

      sessionRepo.findByTokenHash.mockResolvedValue(sesion);
      authRepo.findById.mockResolvedValue(user);
      rbacRepo.buscarMembresia.mockResolvedValue(buildMembresia({ userId: user.id }));
      sessionRepo.create.mockResolvedValue(buildSesion({ id: 'sesion-uuid-2' }));

      const result = await service.refresh(token);

      expect(sessionRepo.invalidate).toHaveBeenCalledWith(sesion.id);
      expect(result.refreshToken).toBeDefined();
      expect(result.accessToken).toBeDefined();
      void hash;
    });

    it('lanza UnauthorizedException si el refresh token no existe', async () => {
      sessionRepo.findByTokenHash.mockResolvedValue(null);
      await expect(service.refresh('token-inexistente')).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('lanza UnauthorizedException si el refresh token ya fue usado (rotado)', async () => {
      sessionRepo.findByTokenHash.mockResolvedValue(buildSesion({ revocadaEn: new Date() }));
      await expect(service.refresh('token-usado')).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('lanza UnauthorizedException si el refresh token esta expirado', async () => {
      sessionRepo.findByTokenHash.mockResolvedValue(buildSesion({ expiraEn: new Date(Date.now() - 1000) }));
      await expect(service.refresh('token-expirado')).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('lanza UnauthorizedException si el usuario ya no existe o esta inactivo', async () => {
      sessionRepo.findByTokenHash.mockResolvedValue(buildSesion());
      authRepo.findById.mockResolvedValue(null);
      await expect(service.refresh('token-valido')).rejects.toBeInstanceOf(UnauthorizedException);
      expect(sessionRepo.invalidate).toHaveBeenCalled();
    });

    it('lanza CuentaBloqueadaException si el usuario fue bloqueado despues de emitido el refresh token', async () => {
      const bloqueadoHasta = new Date(Date.now() + 60_000);
      sessionRepo.findByTokenHash.mockResolvedValue(buildSesion());
      authRepo.findById.mockResolvedValue(buildUsuario({ bloqueadoHasta }));
      await expect(service.refresh('token-valido')).rejects.toBeInstanceOf(CuentaBloqueadaException);
    });

    it('lanza UnauthorizedException si la membresia del tenant original ya no es valida', async () => {
      sessionRepo.findByTokenHash.mockResolvedValue(buildSesion());
      authRepo.findById.mockResolvedValue(buildUsuario());
      rbacRepo.buscarMembresia.mockResolvedValue(null);
      await expect(service.refresh('token-valido')).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('logout', () => {
    it('invalida la sesion activa y responde con el mensaje del contrato', async () => {
      const sesion = buildSesion();
      sessionRepo.findByTokenHash.mockResolvedValue(sesion);

      const result = await service.logout('refresh-valido');
      expect(sessionRepo.invalidate).toHaveBeenCalledWith(sesion.id);
      expect(result).toEqual({ message: 'Session closed successfully.' });
    });

    it('es idempotente: revocar un refresh token inexistente tambien responde 200 sin error', async () => {
      sessionRepo.findByTokenHash.mockResolvedValue(null);
      const result = await service.logout('no-existe');
      expect(sessionRepo.invalidate).not.toHaveBeenCalled();
      expect(result).toEqual({ message: 'Session closed successfully.' });
    });

    it('es idempotente: revocar un refresh token ya revocado no vuelve a invalidar', async () => {
      sessionRepo.findByTokenHash.mockResolvedValue(buildSesion({ revocadaEn: new Date() }));
      const result = await service.logout('ya-revocado');
      expect(sessionRepo.invalidate).not.toHaveBeenCalled();
      expect(result).toEqual({ message: 'Session closed successfully.' });
    });

    it('si viene el access token vigente, borra su sesion en Redis con el jti', async () => {
      sessionRepo.findByTokenHash.mockResolvedValue(buildSesion());
      const { token, jti } = tokenService.generateAccessToken({
        sub: 'usr-uuid-1',
        tenantId: TENANT_ID,
        email: 'user@taller.com',
        roles: ['administrador'],
        permissions: [],
        activeModules: [],
      });

      await service.logout('refresh-valido', token);

      expect(accessTokenSessionMock.deleteSession).toHaveBeenCalledWith(jti);
    });

    it('no llama a Redis si no viene access token', async () => {
      sessionRepo.findByTokenHash.mockResolvedValue(buildSesion());
      await service.logout('refresh-valido');
      expect(accessTokenSessionMock.deleteSession).not.toHaveBeenCalled();
    });
  });
});
