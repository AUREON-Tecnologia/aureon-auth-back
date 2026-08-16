import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { AUTH_REPOSITORY, IAuthRepository } from '../../domain/repositories/auth.repository.interface';
import { Usuario } from '../../domain/entities/usuario.entity';

@Injectable()
export class AuthQueryService {
  constructor(@Inject(AUTH_REPOSITORY) private readonly authRepository: IAuthRepository) {}

  async getById(id: string): Promise<Usuario> {
    const user = await this.authRepository.findById(id);
    if (!user) {
      throw new NotFoundException({ codigo: 'USER_NOT_FOUND', mensaje: 'User not found' });
    }
    return user;
  }
}
