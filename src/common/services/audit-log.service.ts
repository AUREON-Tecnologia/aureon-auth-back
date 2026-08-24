import { Injectable, Logger } from '@nestjs/common';

/** HU_10 (auditoria) + HU_13 (migracion multi-tenant): eventos auditables (RNF-007). */
export type EventoAuditoria =
  | 'LOGIN_EXITOSO'
  | 'LOGIN_TICKET_EMITIDO'
  | 'TENANT_CAMBIADO'
  | 'LOGIN_FALLIDO'
  | 'CUENTA_BLOQUEADA'
  | 'LOGOUT'
  | 'REFRESH_TOKEN'
  | 'USUARIO_CREADO'
  | 'TENANT_CREADO'
  | 'MEMBRESIA_CREADA'
  | 'MEMBRESIA_ACTUALIZADA'
  | 'MEMBRESIA_DESACTIVADA'
  | 'PLATFORM_ADMIN_OTORGADO'
  | 'PLATFORM_ADMIN_REVOCADO'
  | 'EMAIL_VERIFICACION_SOLICITADA'
  | 'EMAIL_VERIFICADO'
  | 'PASSWORD_RESET_SOLICITADO'
  | 'PASSWORD_RESET_COMPLETADO'
  | 'MFA_SETUP_INICIADO';

export interface RegistroAuditoria {
  evento: EventoAuditoria;
  usuarioId?: string;
  tenantId?: string;
  email?: string;
  actorId?: string;
  detalle?: Record<string, unknown>;
}

@Injectable()
export class AuditLogService {
  private readonly logger = new Logger('Auditoria');

  registrar(registro: RegistroAuditoria): void {
    // Nunca incluir contrasenas, tokens ni codigos de un solo uso en el detalle de auditoria.
    this.logger.log(JSON.stringify({ ...registro, timestamp: new Date().toISOString() }));
  }
}
