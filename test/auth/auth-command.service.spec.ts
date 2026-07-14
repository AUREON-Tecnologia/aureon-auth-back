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
  UsuarioWithPassword,
} from '../../src/modules/auth/domain/repositories/auth.repository.interface';
import { Usuario } from '../../src/modules/auth/domain/entities/usuario.entity';
import { UsuarioRol } from '../../src/modules/auth/domain/entities/usuario-rol.entity';

const SECRET = 'test-secret-key-must-be-long-enough-32-chars';

const buildUsuario = (overrides: Partial<Usuario> = {}): Usuario =>
  new Usuario(
    overrides.numeroIdentificacion ?? '1234567890',
    overrides.idTipoNumeroIdentificacion ?? 'tipo-cc',
    overrides.email ?? 'test@taller.com',
    overrides.telefono ?? '+573001234567',
    overrides.idUsuarioRol ?? 'rol-admin',
    overrides.activo ?? true,
    overrides.fechaCreacion ?? new Date('2026-01-01'),
    overrides.rol ?? new UsuarioRol('rol-admin', 'ADMIN', 1),
  );

const buildUsuarioWithPassword = async (
  overrides: Partial<Usuario> = {},
  password = 'Password123!',
): Promise<UsuarioWithPassword> => {
  const base = buildUsuario(overrides);
  const hash = await bcrypt.hash(password, 4);
  return Object.assign(Object.create(base), base, { passwordHash: hash });
};

describe('AuthCommandService', () => {
  let service: AuthCommandService;
  let repo: jest.Mocked<IAuthRepository>;
  let tokenService: TokenService;

  beforeEach(async () => {
    const repoMock: jest.Mocked<IAuthRepository> = {
      findByEmail: jest.fn(),
      findByEmailWithPassword: jest.fn(),
      findByNumeroIdentificacion: jest.fn(),
      findByIdWithRol: jest.fn(),
      create: jest.fn(),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          load: [() => ({ jwt: { secret: SECRET, expiresIn: '1h' } })],
        }),
        JwtModule.registerAsync({
          imports: [ConfigModule],
          inject: [ConfigService],
          useFactory: (cfg: ConfigService) => {
            const expiresIn = cfg.get<string>('jwt.expiresIn') ?? '1h';
            return {
              secret: cfg.get<string>('jwt.secret'),
              signOptions: {
                expiresIn: /^\d+$/.test(expiresIn)
                  ? Number(expiresIn)
                  : (expiresIn as `${number}${'s' | 'm' | 'h' | 'd'}`),
              },
            };
          },
        }),
      ],
      providers: [
        TokenService,
        AuthCommandService,
        { provide: AUTH_REPOSITORY, useValue: repoMock },
      ],
    }).compile();

    service = moduleRef.get(AuthCommandService);
    repo = moduleRef.get(AUTH_REPOSITORY);
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

    it('camino feliz: crea el usuario y devuelve accessToken + user', async () => {
      repo.findByEmail.mockResolvedValue(null);
      repo.findByNumeroIdentificacion.mockResolvedValue(null);
      const created = buildUsuario({ email: validInput.email });
      repo.create.mockImplementation(async (data: CreateUsuarioData) => {
        expect(data.passwordHash).toMatch(/^\$2[aby]\$/);
        expect(data.passwordHash).not.toBe(validInput.password);
        return created;
      });

      const result = await service.register(validInput);
      expect(result.accessToken).toBeDefined();
      expect(result.accessToken.split('.')).toHaveLength(3);
      expect(result.user.email).toBe(validInput.email);
      expect(repo.create).toHaveBeenCalledTimes(1);
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
      await service.register(validInput);
    });
  });

  describe('login', () => {
    const email = 'user@taller.com';
    const password = 'Password123!';

    it('camino feliz: devuelve token cuando las credenciales son validas', async () => {
      const user = buildUsuario({ email });
      const withHash = await buildUsuarioWithPassword({ email }, password);
      repo.findByEmail.mockResolvedValue(user);
      repo.findByEmailWithPassword.mockResolvedValue(withHash);

      const result = await service.login(email, password);
      expect(result.accessToken).toBeDefined();
      expect(result.user.email).toBe(email);
    });

    it('lanza UnauthorizedException si el usuario no existe', async () => {
      repo.findByEmail.mockResolvedValue(null);
      await expect(service.login(email, password)).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('lanza UnauthorizedException si la password es incorrecta', async () => {
      repo.findByEmail.mockResolvedValue(buildUsuario({ email }));
      const withHash = await buildUsuarioWithPassword({ email }, 'OtraPass123!');
      repo.findByEmailWithPassword.mockResolvedValue(withHash);
      await expect(service.login(email, password)).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('lanza UnauthorizedException si el usuario esta inactivo', async () => {
      repo.findByEmail.mockResolvedValue(buildUsuario({ email, activo: false }));
      const withHash = await buildUsuarioWithPassword({ email, activo: false }, password);
      repo.findByEmailWithPassword.mockResolvedValue(withHash);
      await expect(service.login(email, password)).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('refresh', () => {
    it('camino feliz: genera un nuevo token a partir de uno valido', async () => {
      const original = tokenService.generateAccessToken({
        sub: '123',
        email: 'u@taller.com',
        roles: ['ADMIN'],
      });
      repo.findByIdWithRol.mockResolvedValue(buildUsuario({ numeroIdentificacion: '123' }));
      const result = await service.refresh(original);
      expect(result.accessToken).toBeDefined();
      expect(result.accessToken).not.toBe(original);
    });

    it('lanza UnauthorizedException si el token es invalido', async () => {
      await expect(service.refresh('invalid.token')).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('lanza UnauthorizedException si el usuario ya no existe o esta inactivo', async () => {
      const token = tokenService.generateAccessToken({
        sub: '999',
        email: 'u@taller.com',
        roles: [],
      });
      repo.findByIdWithRol.mockResolvedValue(null);
      await expect(service.refresh(token)).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });
});