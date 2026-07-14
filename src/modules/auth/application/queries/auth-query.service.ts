import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  AUTH_REPOSITORY,
  IAuthRepository,
} from '../../domain/repositories/auth.repository.interface';
import { Usuario } from '../../domain/entities/usuario.entity';

@Injectable()
export class AuthQueryService {
  constructor(
    @Inject(AUTH_REPOSITORY) private readonly authRepository: IAuthRepository,
  ) {}

  async getById(numeroIdentificacion: string): Promise<Usuario> {
    const user = await this.authRepository.findByIdWithRol(numeroIdentificacion);
    if (!user) {
      throw new NotFoundException({
        error: 'USER_NOT_FOUND',
        message: 'Usuario no encontrado',
      });
    }
    return user;
  }
}