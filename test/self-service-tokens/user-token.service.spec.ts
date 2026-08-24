import { Test, TestingModule } from '@nestjs/testing';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { UserTokenService } from '../../src/modules/self-service-tokens/application/services/user-token.service';
import {
  IUserTokenRepository,
  USER_TOKEN_REPOSITORY,
} from '../../src/modules/self-service-tokens/domain/repositories/user-token.repository.interface';
import { UserToken } from '../../src/modules/self-service-tokens/domain/entities/user-token.entity';
import { AUTH_REPOSITORY, IAuthRepository } from '../../src/modules/auth/domain/repositories/auth.repository.interface';
import { ISessionRepository, SESSION_REPOSITORY } from '../../src/modules/auth/domain/repositories/session.repository.interface';
import { TokenService } from '../../src/modules/auth/application/services/token.service';
import { Usuario } from '../../src/modules/auth/domain/entities/usuario.entity';
import { AuditLogService } from '../../src/common/services/audit-log.service';

const SECRET = 'test-secret-key-must-be-long-enough-32-chars';

const buildUsuario = (overrides: Partial<Usuario> = {}): Usuario =>
  new Usuario(
    overrides.id ?? 'usr-1',
    overrides.email ?? 'user@taller.com',
    null,
    null,
    overrides.emailVerificadoEn ?? null,
    overrides.activo ?? true,
    overrides.eliminadoEn ?? null,
    0,
    overrides.bloqueadoHasta ?? null,
    null,
    new Date(),
  );

describe('UserTokenService', () => {
  let service: UserTokenService;
  let userTokenRepo: jest.Mocked<IUserTokenRepository>;
  let authRepo: jest.Mocked<IAuthRepository>;
  let sessionRepo: jest.Mocked<ISessionRepository>;
  let tokenService: TokenService;

  beforeEach(async () => {
    const userTokenRepoMock: jest.Mocked<IUserTokenRepository> = {
      crear: jest.fn(),
      buscarVigentePorHash: jest.fn(),
      marcarUsado: jest.fn(),
    };

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
      setPlatformAdmin: jest.fn(),
      listarAdministradoresPlataforma: jest.fn(),
    };

    const sessionRepoMock: jest.Mocked<ISessionRepository> = {
      create: jest.fn(),
      findByTokenHash: jest.fn(),
      invalidate: jest.fn(),
      invalidateAllForUser: jest.fn(),
      invalidateAllForUserInTenant: jest.fn(),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          load: [() => ({ jwt: { secret: SECRET, expiresIn: '1h' }, security: { userTokenExpiraMinutos: 30 } })],
        }),
        JwtModule.registerAsync({
          imports: [ConfigModule],
          inject: [ConfigService],
          useFactory: (cfg: ConfigService) => ({ secret: cfg.get<string>('jwt.secret'), signOptions: { expiresIn: '1h' } }),
        }),
      ],
      providers: [
        UserTokenService,
        TokenService,
        { provide: USER_TOKEN_REPOSITORY, useValue: userTokenRepoMock },
        { provide: AUTH_REPOSITORY, useValue: authRepoMock },
        { provide: SESSION_REPOSITORY, useValue: sessionRepoMock },
        { provide: AuditLogService, useValue: { registrar: jest.fn() } },
      ],
    }).compile();

    service = moduleRef.get(UserTokenService);
    userTokenRepo = moduleRef.get(USER_TOKEN_REPOSITORY);
    authRepo = moduleRef.get(AUTH_REPOSITORY);
    sessionRepo = moduleRef.get(SESSION_REPOSITORY);
    tokenService = moduleRef.get(TokenService);
  });

  describe('solicitarVerificacionEmail / verificarEmail', () => {
    it('emite un token de verificacion si el usuario existe', async () => {
      authRepo.findById.mockResolvedValue(buildUsuario());
      await service.solicitarVerificacionEmail('usr-1');
      expect(userTokenRepo.crear).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'usr-1', tipo: 'EMAIL_VERIFICATION' }),
      );
    });

    it('no falla si el usuario no existe (no revela existencia)', async () => {
      authRepo.findById.mockResolvedValue(null);
      await expect(service.solicitarVerificacionEmail('no-existe')).resolves.toBeUndefined();
      expect(userTokenRepo.crear).not.toHaveBeenCalled();
    });

    it('verificarEmail marca el token usado y el email verificado cuando el token es valido', async () => {
      const registro = new UserToken('tok-1', 'usr-1', 'EMAIL_VERIFICATION', new Date(Date.now() + 60_000), null, new Date());
      userTokenRepo.buscarVigentePorHash.mockResolvedValue(registro);

      const result = await service.verificarEmail('codigo-cualquiera');

      expect(result).toEqual({ verificado: true });
      expect(userTokenRepo.marcarUsado).toHaveBeenCalledWith('tok-1');
      expect(authRepo.marcarEmailVerificado).toHaveBeenCalledWith('usr-1');
    });

    it('verificarEmail retorna false si el token no es valido/vigente', async () => {
      userTokenRepo.buscarVigentePorHash.mockResolvedValue(null);
      const result = await service.verificarEmail('codigo-invalido');
      expect(result).toEqual({ verificado: false });
      expect(authRepo.marcarEmailVerificado).not.toHaveBeenCalled();
    });
  });

  describe('solicitarResetPassword / restablecerPassword', () => {
    it('emite un token de reset si el usuario existe y puede autenticar', async () => {
      authRepo.findByEmail.mockResolvedValue(buildUsuario());
      await service.solicitarResetPassword('user@taller.com');
      expect(userTokenRepo.crear).toHaveBeenCalledWith(
        expect.objectContaining({ tipo: 'PASSWORD_RESET' }),
      );
    });

    it('no falla si el email no existe (evita enumeracion de cuentas)', async () => {
      authRepo.findByEmail.mockResolvedValue(null);
      await expect(service.solicitarResetPassword('no-existe@taller.com')).resolves.toBeUndefined();
      expect(userTokenRepo.crear).not.toHaveBeenCalled();
    });

    it('restablecerPassword actualiza la password e invalida todas las sesiones del usuario', async () => {
      const registro = new UserToken('tok-1', 'usr-1', 'PASSWORD_RESET', new Date(Date.now() + 60_000), null, new Date());
      userTokenRepo.buscarVigentePorHash.mockResolvedValue(registro);

      const result = await service.restablecerPassword('codigo-cualquiera', 'NuevaPass123!');

      expect(result).toEqual({ restablecida: true });
      expect(authRepo.actualizarPassword).toHaveBeenCalledWith('usr-1', expect.stringMatching(/^\$2[aby]\$/));
      expect(sessionRepo.invalidateAllForUser).toHaveBeenCalledWith('usr-1');
    });

    it('restablecerPassword retorna false con un token invalido, sin tocar password ni sesiones', async () => {
      userTokenRepo.buscarVigentePorHash.mockResolvedValue(null);
      const result = await service.restablecerPassword('codigo-invalido', 'NuevaPass123!');
      expect(result).toEqual({ restablecida: false });
      expect(authRepo.actualizarPassword).not.toHaveBeenCalled();
      expect(sessionRepo.invalidateAllForUser).not.toHaveBeenCalled();
    });
  });

  it('iniciarConfiguracionMfa emite un token MFA_SETUP y devuelve su expiracion', async () => {
    const antes = Date.now();
    const { expiraEn } = await service.iniciarConfiguracionMfa('usr-1');
    expect(userTokenRepo.crear).toHaveBeenCalledWith(expect.objectContaining({ tipo: 'MFA_SETUP' }));
    expect(expiraEn.getTime()).toBeGreaterThan(antes);
    void tokenService;
  });
});
