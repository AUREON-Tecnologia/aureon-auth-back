import { Test, TestingModule } from '@nestjs/testing';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { TokenService } from '../../src/modules/auth/application/services/token.service';

describe('TokenService', () => {
  let service: TokenService;
  let configService: ConfigService;
  const SECRET = 'test-secret-key-must-be-long-enough-32-chars';

  beforeEach(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          load: [
            () => ({
              jwt: { secret: SECRET, expiresIn: '1h' },
            }),
          ],
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
      providers: [TokenService],
    }).compile();

    service = moduleRef.get(TokenService);
    configService = moduleRef.get(ConfigService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('generateAccessToken', () => {
    it('genera un JWT firmado con el secret configurado', () => {
      const token = service.generateAccessToken({
        sub: '123',
        email: 'test@test.com',
        roles: ['ADMIN'],
      });
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3);
    });
  });

  describe('verifyAccessToken', () => {
    it('verifica un token valido y retorna el payload', async () => {
      const payload = { sub: '123', email: 'test@test.com', roles: ['ADMIN'] };
      const token = service.generateAccessToken(payload);
      const decoded = await service.verifyAccessToken(token);
      expect(decoded.sub).toBe('123');
      expect(decoded.email).toBe('test@test.com');
      expect(decoded.roles).toEqual(['ADMIN']);
    });

    it('lanza error cuando el token es invalido', async () => {
      await expect(service.verifyAccessToken('invalid.token.here')).rejects.toBeDefined();
    });

    it('lanza error cuando el token tiene firma incorrecta', async () => {
      const payload = { sub: '123', email: 'test@test.com', roles: ['ADMIN'] };
      const token = service.generateAccessToken(payload);
      const tampered = token.slice(0, -5) + 'XXXXX';
      await expect(service.verifyAccessToken(tampered)).rejects.toBeDefined();
    });
  });

  it('usa el secret de configuracion (referencia indirecta via ConfigService)', () => {
    expect(configService.get<string>('jwt.secret')).toBe(SECRET);
  });
});

// Smoke test de bcrypt para asegurar que el modulo nativo esta disponible en el entorno de tests
describe('bcrypt availability', () => {
  it('puede hashear y comparar', async () => {
    const hash = await bcrypt.hash('Password123!', 4);
    expect(await bcrypt.compare('Password123!', hash)).toBe(true);
    expect(await bcrypt.compare('wrong', hash)).toBe(false);
  });
});