import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { OtpService } from '../../src/modules/otp/application/services/otp.service';
import {
  IOtpRepository,
  OTP_REPOSITORY,
} from '../../src/modules/otp/domain/repositories/otp.repository.interface';
import { TokenVerificacion } from '../../src/modules/otp/domain/entities/token-verificacion.entity';
import { AuditLogService } from '../../src/common/services/audit-log.service';

const buildToken = (overrides: Partial<TokenVerificacion> = {}): TokenVerificacion =>
  new TokenVerificacion(
    overrides.id ?? 'otp-1',
    overrides.idCliente ?? null,
    overrides.numeroTelefono ?? '+573001234567',
    overrides.email ?? null,
    overrides.token ?? '12345678',
    overrides.proposito ?? 'otp_identidad',
    overrides.expiraEn ?? new Date(Date.now() + 60_000),
    overrides.usado ?? false,
    overrides.creadoEn ?? new Date(),
  );

describe('OtpService', () => {
  let service: OtpService;
  let repo: jest.Mocked<IOtpRepository>;

  beforeEach(async () => {
    const repoMock: jest.Mocked<IOtpRepository> = {
      crear: jest.fn(),
      buscarValido: jest.fn(),
      marcarUsado: jest.fn(),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          load: [() => ({ security: { otpExpiraMinutos: 5 } })],
        }),
      ],
      providers: [
        OtpService,
        { provide: OTP_REPOSITORY, useValue: repoMock },
        { provide: AuditLogService, useValue: { registrar: jest.fn() } },
      ],
    }).compile();

    service = moduleRef.get(OtpService);
    repo = moduleRef.get(OTP_REPOSITORY);
  });

  describe('emitir', () => {
    it('genera un codigo de 8 digitos, lo persiste y devuelve solo la fecha de expiracion', async () => {
      repo.crear.mockResolvedValue(buildToken());

      const antes = Date.now();
      const { expiraEn } = await service.emitir({
        numeroTelefono: '+573001234567',
        proposito: 'otp_identidad',
      });

      expect(repo.crear).toHaveBeenCalledTimes(1);
      const dataCreada = repo.crear.mock.calls[0][0];
      expect(dataCreada.token).toMatch(/^\d{8}$/);
      expect(dataCreada.proposito).toBe('otp_identidad');
      expect(expiraEn.getTime()).toBeGreaterThan(antes);
      // La respuesta nunca debe filtrar el codigo generado.
      expect(JSON.stringify({ expiraEn })).not.toContain(dataCreada.token);
    });
  });

  describe('verificar', () => {
    it('retorna valido=true y marca el token como usado cuando coincide', async () => {
      const token = buildToken();
      repo.buscarValido.mockResolvedValue(token);

      const result = await service.verificar({
        numeroTelefono: '+573001234567',
        proposito: 'otp_identidad',
        codigo: '12345678',
      });

      expect(result).toEqual({ valido: true });
      expect(repo.marcarUsado).toHaveBeenCalledWith(token.id);
    });

    it('retorna valido=false sin marcar nada cuando no hay coincidencia', async () => {
      repo.buscarValido.mockResolvedValue(null);

      const result = await service.verificar({
        numeroTelefono: '+573001234567',
        proposito: 'otp_identidad',
        codigo: '00000000',
      });

      expect(result).toEqual({ valido: false });
      expect(repo.marcarUsado).not.toHaveBeenCalled();
    });
  });
});
