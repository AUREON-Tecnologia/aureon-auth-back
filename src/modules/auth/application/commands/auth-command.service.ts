import {
  ConflictException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import {
  AUTH_REPOSITORY,
  IAuthRepository,
} from '../../domain/repositories/auth.repository.interface';
import { Usuario } from '../../domain/entities/usuario.entity';
import { TokenService } from '../services/token.service';

export interface RegisterInput {
  numeroIdentificacion: string;
  idTipoNumeroIdentificacion: string;
  email: string;
  telefono: string;
  password: string;
  idUsuarioRol: string;
}

export interface AuthResult {
  accessToken: string;
  user: Usuario;
}

@Injectable()
export class AuthCommandService {
  private static readonly BCRYPT_ROUNDS = 10;

  constructor(
    @Inject(AUTH_REPOSITORY) private readonly authRepository: IAuthRepository,
    private readonly tokenService: TokenService,
  ) {}

  async register(input: RegisterInput): Promise<AuthResult> {
    const existingByEmail = await this.authRepository.findByEmail(input.email);
    if (existingByEmail) {
      throw new ConflictException({
        error: 'USER_ALREADY_EXISTS',
        message: 'Ya existe un usuario con ese email',
      });
    }

    const existingByDoc = await this.authRepository.findByNumeroIdentificacion(
      input.numeroIdentificacion,
    );
    if (existingByDoc) {
      throw new ConflictException({
        error: 'USER_ALREADY_EXISTS',
        message: 'Ya existe un usuario con ese numero de identificacion',
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

    const accessToken = this.tokenService.generateAccessToken({
      sub: user.numeroIdentificacion,
      email: user.email,
      roles: user.rol ? [user.rol.nombre] : [],
    });

    return { accessToken, user };
  }

  async login(email: string, password: string): Promise<AuthResult> {
    const user = await this.authRepository.findByEmail(email);
    if (!user) {
      throw new UnauthorizedException({
        error: 'INVALID_CREDENTIALS',
        message: 'Credenciales invalidas',
      });
    }

    if (!user.activo) {
      throw new UnauthorizedException({
        error: 'INVALID_CREDENTIALS',
        message: 'Credenciales invalidas',
      });
    }

    const userWithHash = await this.authRepository.findByEmailWithPassword(email);
    if (!userWithHash) {
      throw new UnauthorizedException({
        error: 'INVALID_CREDENTIALS',
        message: 'Credenciales invalidas',
      });
    }

    const passwordOk = await bcrypt.compare(password, userWithHash.passwordHash);
    if (!passwordOk) {
      throw new UnauthorizedException({
        error: 'INVALID_CREDENTIALS',
        message: 'Credenciales invalidas',
      });
    }

    const accessToken = this.tokenService.generateAccessToken({
      sub: user.numeroIdentificacion,
      email: user.email,
      roles: user.rol ? [user.rol.nombre] : [],
    });

    return { accessToken, user };
  }

  async refresh(accessToken: string): Promise<{ accessToken: string }> {
    let payload;
    try {
      payload = await this.tokenService.verifyAccessToken(accessToken);
    } catch {
      throw new UnauthorizedException({
        error: 'INVALID_CREDENTIALS',
        message: 'Token invalido o expirado',
      });
    }
    const user = await this.authRepository.findByIdWithRol(payload.sub);
    if (!user || !user.activo) {
      throw new UnauthorizedException({
        error: 'INVALID_CREDENTIALS',
        message: 'Usuario no encontrado o inactivo',
      });
    }
    const newToken = this.tokenService.generateAccessToken({
      sub: user.numeroIdentificacion,
      email: user.email,
      roles: user.rol ? [user.rol.nombre] : [],
    });
    return { accessToken: newToken };
  }
}