import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import {
  IUserTokenRepository,
  USER_TOKEN_REPOSITORY,
} from '../../domain/repositories/user-token.repository.interface';
import { TipoUserToken } from '../../domain/entities/user-token.entity';
import {
  AUTH_REPOSITORY,
  IAuthRepository,
} from '../../../auth/domain/repositories/auth.repository.interface';
import {
  ISessionRepository,
  SESSION_REPOSITORY,
} from '../../../auth/domain/repositories/session.repository.interface';
import { TokenService } from '../../../auth/application/services/token.service';
import { AuditLogService } from '../../../../common/services/audit-log.service';

const BCRYPT_ROUNDS = 10;

/** HU_13 (reemplaza HU_08/09): verificacion de email, reset de password y plumbing de MFA setup sobre `user_tokens`. */
@Injectable()
export class UserTokenService {
  constructor(
    @Inject(USER_TOKEN_REPOSITORY) private readonly userTokenRepository: IUserTokenRepository,
    @Inject(AUTH_REPOSITORY) private readonly authRepository: IAuthRepository,
    @Inject(SESSION_REPOSITORY) private readonly sessionRepository: ISessionRepository,
    private readonly tokenService: TokenService,
    private readonly configService: ConfigService,
    private readonly auditLog: AuditLogService,
  ) {}

  async solicitarVerificacionEmail(userId: string): Promise<void> {
    const usuario = await this.authRepository.findById(userId);
    if (!usuario) return;
    await this.emitirToken(usuario.id, 'EMAIL_VERIFICATION');
    this.auditLog.registrar({ evento: 'EMAIL_VERIFICACION_SOLICITADA', usuarioId: usuario.id });
  }

  async verificarEmail(token: string): Promise<{ verificado: boolean }> {
    const hash = this.tokenService.hashToken(token);
    const registro = await this.userTokenRepository.buscarVigentePorHash(hash, 'EMAIL_VERIFICATION');
    if (!registro) return { verificado: false };

    await this.userTokenRepository.marcarUsado(registro.id);
    await this.authRepository.marcarEmailVerificado(registro.userId);
    this.auditLog.registrar({ evento: 'EMAIL_VERIFICADO', usuarioId: registro.userId });
    return { verificado: true };
  }

  /** Nunca revela si el email existe o no (evita enumeracion de cuentas) — el llamador siempre recibe el mismo mensaje. */
  async solicitarResetPassword(email: string): Promise<void> {
    const usuario = await this.authRepository.findByEmail(email);
    if (!usuario || !usuario.puedeAutenticar) return;
    await this.emitirToken(usuario.id, 'PASSWORD_RESET');
    this.auditLog.registrar({ evento: 'PASSWORD_RESET_SOLICITADO', usuarioId: usuario.id, email });
  }

  async restablecerPassword(token: string, nuevaPassword: string): Promise<{ restablecida: boolean }> {
    const hash = this.tokenService.hashToken(token);
    const registro = await this.userTokenRepository.buscarVigentePorHash(hash, 'PASSWORD_RESET');
    if (!registro) return { restablecida: false };

    await this.userTokenRepository.marcarUsado(registro.id);
    const passwordHash = await bcrypt.hash(nuevaPassword, BCRYPT_ROUNDS);
    await this.authRepository.actualizarPassword(registro.userId, passwordHash);
    // Buena practica de seguridad: un reset de password invalida todas las sesiones activas.
    await this.sessionRepository.invalidateAllForUser(registro.userId);
    this.auditLog.registrar({ evento: 'PASSWORD_RESET_COMPLETADO', usuarioId: registro.userId });
    return { restablecida: true };
  }

  async iniciarConfiguracionMfa(userId: string): Promise<{ expiraEn: Date }> {
    const resultado = await this.emitirToken(userId, 'MFA_SETUP');
    this.auditLog.registrar({ evento: 'MFA_SETUP_INICIADO', usuarioId: userId });
    return resultado;
  }

  private async emitirToken(userId: string, tipo: TipoUserToken): Promise<{ expiraEn: Date }> {
    const minutos = this.configService.get<number>('security.userTokenExpiraMinutos') ?? 30;
    const expiraEn = new Date(Date.now() + minutos * 60_000);
    const { hash } = this.tokenService.generateOpaqueToken();
    await this.userTokenRepository.crear({ userId, tipo, tokenHash: hash, expiraEn });
    // El envio real (correo) lo hace el servicio de notificaciones de la plataforma,
    // que todavia no existe como integracion en este repo. Nunca se loguea el valor.
    return { expiraEn };
  }
}
