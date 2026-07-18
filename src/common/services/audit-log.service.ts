import { Injectable, Logger } from '@nestjs/common';

/** HU_10: eventos de acceso y cambios administrativos auditables (RNF-007). */
export type EventoAuditoria =
  | 'LOGIN_EXITOSO'
  | 'LOGIN_FALLIDO'
  | 'CUENTA_BLOQUEADA'
  | 'LOGOUT'
  | 'REFRESH_TOKEN'
  | 'USUARIO_CREADO'
  | 'USUARIO_ACTUALIZADO'
  | 'USUARIO_DESACTIVADO'
  | 'OTP_EMITIDO'
  | 'OTP_VERIFICADO'
  | 'OTP_VERIFICACION_FALLIDA';

export interface RegistroAuditoria {
  evento: EventoAuditoria;
  usuarioId?: string;
  email?: string;
  actorId?: string;
  detalle?: Record<string, unknown>;
}

@Injectable()
export class AuditLogService {
  private readonly logger = new Logger('Auditoria');

  registrar(registro: RegistroAuditoria): void {
    // Nunca incluir contrasenas, tokens ni codigos OTP en el detalle de auditoria.
    this.logger.log(JSON.stringify({ ...registro, timestamp: new Date().toISOString() }));
  }
}
