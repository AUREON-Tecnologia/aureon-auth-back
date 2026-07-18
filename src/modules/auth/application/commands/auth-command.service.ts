import { ConflictException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import {
  AUTH_REPOSITORY,
  IAuthRepository,
} from '../../domain/repositories/auth.repository.interface';
import {
  SESSION_REPOSITORY,
  ISessionRepository,
} from '../../domain/repositories/session.repository.interface';
import { Usuario } from '../../domain/entities/usuario.entity';
import { RolNegocio, resolverRolNegocio } from '../../../../common/domain/rol-negocio';
import { TokenService } from '../services/token.service';
import { AuditLogService } from '../../../../common/services/audit-log.service';
import { CuentaBloqueadaException } from '../../../../common/exceptions/cuenta-bloqueada.exception';

export interface RegisterInput {
  numeroIdentificacion: string;
  idTipoNumeroIdentificacion: string;
  email: string;
  telefono: string;
  password: string;
  idUsuarioRol: string;
}

export interface AuthSessionResult {
  usuario: Usuario;
  rol: RolNegocio;
  accessToken: string;
  accessTokenExpiraEn: Date;
  refreshToken: string;
  refreshExpiraEn: Date;
}

const MENSAJE_CREDENCIALES_INVALIDAS = 'Credenciales invalidas';

@Injectable()
export class AuthCommandService {
  private static readonly BCRYPT_ROUNDS = 10;

  constructor(
    @Inject(AUTH_REPOSITORY) private readonly authRepository: IAuthRepository,
    @Inject(SESSION_REPOSITORY) private readonly sessionRepository: ISessionRepository,
    private readonly tokenService: TokenService,
    private readonly configService: ConfigService,
    private readonly auditLog: AuditLogService,
  ) {}

  async register(input: RegisterInput, ipOrigen?: string): Promise<AuthSessionResult> {
    const existingByEmail = await this.authRepository.findByEmail(input.email);
    if (existingByEmail) {
      throw new ConflictException({
        codigo: 'USER_ALREADY_EXISTS',
        mensaje: 'Ya existe un usuario con ese email',
      });
    }

    const existingByDoc = await this.authRepository.findByNumeroIdentificacion(
      input.numeroIdentificacion,
    );
    if (existingByDoc) {
      throw new ConflictException({
        codigo: 'USER_ALREADY_EXISTS',
        mensaje: 'Ya existe un usuario con ese numero de identificacion',
      });
    }

    const passwordHash = await bcrypt.hash(input.password, AuthCommandService.BCRYPT_ROUNDS);

    const user = await this.authRepository.create({
      numeroIdentificacion: input.numeroIdentificacion,
      idTipoNumeroIdentificacion: input.idTipoNumeroIdentificacion,
      email: input.email,
      telefono: input.telefono,
      passwordHash,
      idUsuarioRol: input.idUsuarioRol,
    });

    this.auditLog.registrar({ evento: 'USUARIO_CREADO', usuarioId: user.id, email: user.email });
    return this.emitirSesion(user, ipOrigen);
  }

  async login(email: string, password: string, ipOrigen?: string): Promise<AuthSessionResult> {
    const maxIntentos = this.configService.get<number>('security.maxIntentosFallidos') ?? 5;
    const minutosBloqueo = this.configService.get<number>('security.bloqueoMinutos') ?? 15;

    const user = await this.authRepository.findByEmail(email);
    if (!user) {
      this.auditLog.registrar({ evento: 'LOGIN_FALLIDO', email, detalle: { motivo: 'no_existe' } });
      throw new UnauthorizedException({ codigo: 'INVALID_CREDENTIALS', mensaje: MENSAJE_CREDENCIALES_INVALIDAS });
    }

    if (user.bloqueadoHasta && user.bloqueadoHasta.getTime() > Date.now()) {
      this.auditLog.registrar({ evento: 'CUENTA_BLOQUEADA', usuarioId: user.id, email });
      throw new CuentaBloqueadaException(user.bloqueadoHasta);
    }

    if (!user.activo) {
      this.auditLog.registrar({
        evento: 'LOGIN_FALLIDO',
        usuarioId: user.id,
        email,
        detalle: { motivo: 'inactivo' },
      });
      throw new UnauthorizedException({ codigo: 'INVALID_CREDENTIALS', mensaje: MENSAJE_CREDENCIALES_INVALIDAS });
    }

    const userWithHash = await this.authRepository.findByEmailWithPassword(email);
    const passwordOk = userWithHash ? await bcrypt.compare(password, userWithHash.passwordHash) : false;

    if (!passwordOk) {
      const nuevosIntentos = user.intentosFallidos + 1;
      if (nuevosIntentos >= maxIntentos) {
        const bloqueadoHasta = new Date(Date.now() + minutosBloqueo * 60_000);
        await this.authRepository.registrarIntentoFallido(user.id, nuevosIntentos, bloqueadoHasta);
        this.auditLog.registrar({ evento: 'CUENTA_BLOQUEADA', usuarioId: user.id, email });
        throw new CuentaBloqueadaException(bloqueadoHasta);
      }
      await this.authRepository.registrarIntentoFallido(user.id, nuevosIntentos, null);
      this.auditLog.registrar({
        evento: 'LOGIN_FALLIDO',
        usuarioId: user.id,
        email,
        detalle: { motivo: 'password_incorrecta' },
      });
      throw new UnauthorizedException({ codigo: 'INVALID_CREDENTIALS', mensaje: MENSAJE_CREDENCIALES_INVALIDAS });
    }

    await this.authRepository.registrarLoginExitoso(user.id);
    this.auditLog.registrar({ evento: 'LOGIN_EXITOSO', usuarioId: user.id, email });
    return this.emitirSesion(user, ipOrigen);
  }

  async refresh(refreshToken: string, ipOrigen?: string): Promise<AuthSessionResult> {
    const hash = this.tokenService.hashToken(refreshToken);
    const sesion = await this.sessionRepository.findByTokenHash(hash);

    if (!sesion || !sesion.activa || sesion.expiraEn.getTime() <= Date.now()) {
      throw new UnauthorizedException({
        codigo: 'INVALID_CREDENTIALS',
        mensaje: 'Refresh token invalido, expirado o ya utilizado',
      });
    }

    const user = await this.authRepository.findById(sesion.idUsuario);
    if (!user || !user.activo) {
      await this.sessionRepository.invalidate(sesion.id);
      throw new UnauthorizedException({
        codigo: 'INVALID_CREDENTIALS',
        mensaje: 'Usuario no encontrado o inactivo',
      });
    }

    if (user.bloqueadoHasta && user.bloqueadoHasta.getTime() > Date.now()) {
      throw new CuentaBloqueadaException(user.bloqueadoHasta);
    }

    // Rotacion: el refresh token usado queda invalidado se use o no una nueva sesion despues.
    await this.sessionRepository.invalidate(sesion.id);
    this.auditLog.registrar({ evento: 'REFRESH_TOKEN', usuarioId: user.id });
    return this.emitirSesion(user, ipOrigen);
  }

  async logout(refreshToken: string): Promise<{ mensaje: string }> {
    const hash = this.tokenService.hashToken(refreshToken);
    const sesion = await this.sessionRepository.findByTokenHash(hash);

    if (sesion && sesion.activa) {
      await this.sessionRepository.invalidate(sesion.id);
      this.auditLog.registrar({ evento: 'LOGOUT', usuarioId: sesion.idUsuario });
    }

    // Idempotente por contrato: revocar un refresh token ya revocado tambien responde 200.
    return { mensaje: 'Sesion cerrada correctamente.' };
  }

  private async emitirSesion(user: Usuario, ipOrigen?: string): Promise<AuthSessionResult> {
    const rol = resolverRolNegocio(user.rol?.nombre);

    const { token: accessToken, expiraEn: accessTokenExpiraEn } = this.tokenService.generateAccessToken({
      sub: user.id,
      email: user.email,
      roles: [rol],
    });

    const { token: refreshToken, hash } = this.tokenService.generateOpaqueToken();
    const refreshDias = this.configService.get<number>('security.refreshExpiresInDias') ?? 30;
    const refreshExpiraEn = new Date(Date.now() + refreshDias * 24 * 60 * 60 * 1000);

    await this.sessionRepository.create({
      idUsuario: user.id,
      tokenHash: hash,
      expiraEn: refreshExpiraEn,
      ipOrigen: ipOrigen ?? null,
    });

    return { usuario: user, rol, accessToken, accessTokenExpiraEn, refreshToken, refreshExpiraEn };
  }
}
