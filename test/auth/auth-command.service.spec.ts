import { Test, TestingModule } from '@nestjs/testing';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { AuthCommandService } from '../../src/modules/auth/application/commands/auth-command.service';
import { TokenService } from '../../src/modules/auth/application/services/token.service';
import {
  AUTH_REPOSITORY,
  IAuthRepository,
  CreateUsuarioData,
} from '../../src/modules/auth/domain/repositories/auth.repository.interface';
import {
  SESSION_REPOSITORY,
  ISessionRepository,
  SesionUsuario,
} from '../../src/modules/auth/domain/repositories/session.repository.interface';
import { Usuario } from '../../src/modules/auth/domain/entities/usuario.entity';
import { UsuarioRol } from '../../src/modules/auth/domain/entities/usuario-rol.entity';
import { AuditLogService } from '../../src/common/services/audit-log.service';
import { CuentaBloqueadaException } from '../../src/common/exceptions/cuenta-bloqueada.exception';

const SECRET = 'test-secret-key-must-be-long-enough-32-chars';
const MAX_INTENTOS = 5;
const BLOQUEO_MINUTOS = 15;

const buildUsuario = (overrides: Partial<Usuario> = {}): Usuario =>
  new Usuario(
    overrides.id ?? 'usr-uuid-1',
    overrides.numeroIdentificacion ?? '1234567890',
    overrides.idTipoNumeroIdentificacion ?? 'tipo-cc',
    overrides.email ?? 'test@taller.com',
    overrides.telefono ?? '+573001234567',
    overrides.idUsuarioRol ?? 'rol-admin',
    overrides.activo ?? true,
    overrides.intentosFallidos ?? 0,
    overrides.bloqueadoHasta ?? null,
    overrides.ultimoAcceso ?? null,
    overrides.fechaCreacion ?? new Date('2026-01-01'),
    overrides.rol ?? new UsuarioRol('rol-admin', 'administrador', 10),
  );

const buildUsuarioWithPassword = async (
  overrides: Partial<Usuario> = {},
  password = 'Password123!',
) => {
  const base = buildUsuario(overrides);
  const hash = await bcrypt.hash(password, 4);
  return Object.assign(Object.create(base), base, { passwordHash: hash });
};

const buildSesion = (overrides: Partial<SesionUsuario> = {}): SesionUsuario => ({
  id: overrides.id ?? 'sesion-uuid-1',
  idUsuario: overrides.idUsuario ?? 'usr-uuid-1',
  expiraEn: overrides.expiraEn ?? new Date(Date.now() + 60_000),
  activa: overrides.activa ?? true,
  creadaEn: overrides.creadaEn ?? new Date(),
});

describe('AuthCommandService', () => {
  let service: AuthCommandService;
  let repo: jest.Mocked<IAuthRepository>;
  let sessionRepo: jest.Mocked<ISessionRepository>;
  let tokenService: TokenService;

  beforeEach(async () => {
    const repoMock: jest.Mocked<IAuthRepository> = {
      findById: jest.fn(),
      findByEmail: jest.fn(),
      findByEmailWithPassword: jest.fn(),
      findByNumeroIdentificacion: jest.fn(),
      findAll: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      registrarLoginExitoso: jest.fn(),
      registrarIntentoFallido: jest.fn(),
    };

    const sessionRepoMock: jest.Mocked<ISessionRepository> = {
      create: jest.fn(),
      findByTokenHash: jest.fn(),
      invalidate: jest.fn(),
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
        { provide: AUTH_REPOSITORY, useValue: repoMock },
        { provide: SESSION_REPOSITORY, useValue: sessionRepoMock },
        { provide: AuditLogService, useValue: { registrar: jest.fn() } },
      ],
    }).compile();

    service = moduleRef.get(AuthCommandService);
    repo = moduleRef.get(AUTH_REPOSITORY);
    sessionRepo = moduleRef.get(SESSION_REPOSITORY);
    tokenService = moduleRef.get(TokenService);
  });

  describe('register', () => {
    const validInput = {
      numeroIdentificacion: '1234567890',
      idTipoNumeroIdentificacion: 'tipo-cc',
      email: 'nuevo@taller.com',
      telefono: '+573001234567',
      password: 'Password123!',
      idUsuarioRol: 'rol-admin',
    };

    it('camino feliz: crea el usuario, abre sesion y devuelve tokens', async () => {
      repo.findByEmail.mockResolvedValue(null);
      repo.findByNumeroIdentificacion.mockResolvedValue(null);
      const created = buildUsuario({ email: validInput.email });
      repo.create.mockImplementation(async (data: CreateUsuarioData) => {
        expect(data.passwordHash).toMatch(/^\$2[aby]\$/);
        expect(data.passwordHash).not.toBe(validInput.password);
        return created;
      });
      sessionRepo.create.mockResolvedValue(buildSesion());

      const result = await service.register(validInput);
      expect(result.accessToken.split('.')).toHaveLength(3);
      expect(result.refreshToken).toBeDefined();
      expect(result.usuario.email).toBe(validInput.email);
      expect(result.rol).toBe('administrador');
      expect(repo.create).toHaveBeenCalledTimes(1);
      expect(sessionRepo.create).toHaveBeenCalledTimes(1);
    });

    it('lanza ConflictException si el email ya existe', async () => {
      repo.findByEmail.mockResolvedValue(buildUsuario());
      await expect(service.register(validInput)).rejects.toBeInstanceOf(ConflictException);
      expect(repo.create).not.toHaveBeenCalled();
    });

    it('lanza ConflictException si el numero_identificacion ya existe', async () => {
      repo.findByEmail.mockResolvedValue(null);
      repo.findByNumeroIdentificacion.mockResolvedValue(buildUsuario());
      await expect(service.register(validInput)).rejects.toBeInstanceOf(ConflictException);
      expect(repo.create).not.toHaveBeenCalled();
    });

    it('hashea la password con bcrypt (no guarda plaintext)', async () => {
      repo.findByEmail.mockResolvedValue(null);
      repo.findByNumeroIdentificacion.mockResolvedValue(null);
      repo.create.mockImplementation(async (data: CreateUsuarioData) => {
        const ok = await bcrypt.compare(validInput.password, data.passwordHash);
        expect(ok).toBe(true);
        return buildUsuario();
      });
      sessionRepo.create.mockResolvedValue(buildSesion());
      await service.register(validInput);
    });
  });

  describe('login', () => {
    const email = 'user@taller.com';
    const password = 'Password123!';

    it('camino feliz: devuelve token y refresh cuando las credenciales son validas', async () => {
      const user = buildUsuario({ email });
      const withHash = await buildUsuarioWithPassword({ email }, password);
      repo.findByEmail.mockResolvedValue(user);
      repo.findByEmailWithPassword.mockResolvedValue(withHash);
      sessionRepo.create.mockResolvedValue(buildSesion());

      const result = await service.login(email, password);
      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
      expect(result.usuario.email).toBe(email);
      expect(repo.registrarLoginExitoso).toHaveBeenCalledWith(user.id);
    });

    it('lanza UnauthorizedException si el usuario no existe', async () => {
      repo.findByEmail.mockResolvedValue(null);
      await expect(service.login(email, password)).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('lanza UnauthorizedException si la password es incorrecta y registra el intento fallido', async () => {
      const user = buildUsuario({ email, intentosFallidos: 0 });
      repo.findByEmail.mockResolvedValue(user);
      const withHash = await buildUsuarioWithPassword({ email }, 'OtraPass123!');
      repo.findByEmailWithPassword.mockResolvedValue(withHash);

      await expect(service.login(email, password)).rejects.toBeInstanceOf(UnauthorizedException);
      expect(repo.registrarIntentoFallido).toHaveBeenCalledWith(user.id, 1, null);
    });

    it('lanza UnauthorizedException si el usuario esta inactivo', async () => {
      repo.findByEmail.mockResolvedValue(buildUsuario({ email, activo: false }));
      await expect(service.login(email, password)).rejects.toBeInstanceOf(UnauthorizedException);
      expect(repo.findByEmailWithPassword).not.toHaveBeenCalled();
    });

    it('bloquea la cuenta (423) al alcanzar el maximo de intentos fallidos', async () => {
      const user = buildUsuario({ email, intentosFallidos: MAX_INTENTOS - 1 });
      repo.findByEmail.mockResolvedValue(user);
      const withHash = await buildUsuarioWithPassword({ email }, 'OtraPass123!');
      repo.findByEmailWithPassword.mockResolvedValue(withHash);

      await expect(service.login(email, password)).rejects.toBeInstanceOf(CuentaBloqueadaException);
      expect(repo.registrarIntentoFallido).toHaveBeenCalledWith(
        user.id,
        MAX_INTENTOS,
        expect.any(Date),
      );
    });

    it('rechaza con 423 sin comparar password si la cuenta ya esta bloqueada', async () => {
      const bloqueadoHasta = new Date(Date.now() + 60_000);
      const user = buildUsuario({ email, bloqueadoHasta });
      repo.findByEmail.mockResolvedValue(user);

      await expect(service.login(email, password)).rejects.toBeInstanceOf(CuentaBloqueadaException);
      expect(repo.findByEmailWithPassword).not.toHaveBeenCalled();
    });
  });

  describe('refresh', () => {
    it('camino feliz: rota el refresh token y emite un access token nuevo', async () => {
      const user = buildUsuario();
      const { token, hash } = tokenService.generateOpaqueToken();
      const sesion = buildSesion({ idUsuario: user.id });

      sessionRepo.findByTokenHash.mockResolvedValue(sesion);
      repo.findById.mockResolvedValue(user);
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
      sessionRepo.findByTokenHash.mockResolvedValue(buildSesion({ activa: false }));
      await expect(service.refresh('token-usado')).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('lanza UnauthorizedException si el refresh token esta expirado', async () => {
      sessionRepo.findByTokenHash.mockResolvedValue(
        buildSesion({ expiraEn: new Date(Date.now() - 1000) }),
      );
      await expect(service.refresh('token-expirado')).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('lanza UnauthorizedException si el usuario ya no existe o esta inactivo', async () => {
      sessionRepo.findByTokenHash.mockResolvedValue(buildSesion());
      repo.findById.mockResolvedValue(null);
      await expect(service.refresh('token-valido')).rejects.toBeInstanceOf(UnauthorizedException);
      expect(sessionRepo.invalidate).toHaveBeenCalled();
    });

    it('lanza CuentaBloqueadaException si el usuario fue bloqueado despues de emitido el refresh token', async () => {
      const bloqueadoHasta = new Date(Date.now() + 60_000);
      sessionRepo.findByTokenHash.mockResolvedValue(buildSesion());
      repo.findById.mockResolvedValue(buildUsuario({ bloqueadoHasta }));
      await expect(service.refresh('token-valido')).rejects.toBeInstanceOf(CuentaBloqueadaException);
    });
  });

  describe('logout', () => {
    it('invalida la sesion activa y responde con el mensaje del contrato', async () => {
      const sesion = buildSesion();
      sessionRepo.findByTokenHash.mockResolvedValue(sesion);

      const result = await service.logout('refresh-valido');
      expect(sessionRepo.invalidate).toHaveBeenCalledWith(sesion.id);
      expect(result).toEqual({ mensaje: 'Sesion cerrada correctamente.' });
    });

    it('es idempotente: revocar un refresh token inexistente tambien responde 200 sin error', async () => {
      sessionRepo.findByTokenHash.mockResolvedValue(null);
      const result = await service.logout('no-existe');
      expect(sessionRepo.invalidate).not.toHaveBeenCalled();
      expect(result).toEqual({ mensaje: 'Sesion cerrada correctamente.' });
    });

    it('es idempotente: revocar un refresh token ya revocado no vuelve a invalidar', async () => {
      sessionRepo.findByTokenHash.mockResolvedValue(buildSesion({ activa: false }));
      const result = await service.logout('ya-revocado');
      expect(sessionRepo.invalidate).not.toHaveBeenCalled();
      expect(result).toEqual({ mensaje: 'Sesion cerrada correctamente.' });
    });
  });
});
