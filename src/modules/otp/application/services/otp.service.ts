import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomInt } from 'crypto';
import { IOtpRepository, OTP_REPOSITORY } from '../../domain/repositories/otp.repository.interface';
import { PropositoOtp } from '../../domain/entities/token-verificacion.entity';
import { AuditLogService } from '../../../../common/services/audit-log.service';

export interface EmitirOtpInput {
  numeroTelefono?: string;
  email?: string;
  proposito: PropositoOtp;
}

export interface VerificarOtpInput {
  numeroTelefono?: string;
  email?: string;
  proposito: PropositoOtp;
  codigo: string;
}

const LONGITUD_CODIGO = 8;

@Injectable()
export class OtpService {
  constructor(
    @Inject(OTP_REPOSITORY) private readonly otpRepository: IOtpRepository,
    private readonly configService: ConfigService,
    private readonly auditLog: AuditLogService,
  ) {}

  async emitir(input: EmitirOtpInput): Promise<{ expiraEn: Date }> {
    const minutos = this.configService.get<number>('security.otpExpiraMinutos') ?? 5;
    const expiraEn = new Date(Date.now() + minutos * 60_000);
    const codigo = this.generarCodigo();

    await this.otpRepository.crear({
      numeroTelefono: input.numeroTelefono ?? null,
      email: input.email ?? null,
      token: codigo,
      proposito: input.proposito,
      expiraEn,
    });

    // El envio real (WhatsApp/correo) lo hace el servicio de notificaciones de la
    // plataforma, que todavia no existe como integracion en este repo (ver
    // docus/CONTEXTO_PROYECTO.md seccion 4). Aqui solo se registra el evento,
    // nunca el valor del codigo.
    this.auditLog.registrar({
      evento: 'OTP_EMITIDO',
      detalle: { proposito: input.proposito, canal: input.numeroTelefono ? 'telefono' : 'email' },
    });

    return { expiraEn };
  }

  async verificar(input: VerificarOtpInput): Promise<{ valido: boolean }> {
    const registro = await this.otpRepository.buscarValido({
      numeroTelefono: input.numeroTelefono,
      email: input.email,
      proposito: input.proposito,
      token: input.codigo,
    });

    if (!registro) {
      this.auditLog.registrar({
        evento: 'OTP_VERIFICACION_FALLIDA',
        detalle: { proposito: input.proposito },
      });
      return { valido: false };
    }

    await this.otpRepository.marcarUsado(registro.id);
    this.auditLog.registrar({ evento: 'OTP_VERIFICADO', detalle: { proposito: input.proposito } });
    return { valido: true };
  }

  private generarCodigo(): string {
    return Array.from({ length: LONGITUD_CODIGO }, () => randomInt(0, 10)).join('');
  }
}
