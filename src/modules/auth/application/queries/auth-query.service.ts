import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  AUTH_REPOSITORY,
  FiltrosUsuario,
  IAuthRepository,
} from '../../domain/repositories/auth.repository.interface';
import { Usuario } from '../../domain/entities/usuario.entity';
import { Paginacion, PaginacionMeta } from '../../../../common/domain/paginacion-meta';

@Injectable()
export class AuthQueryService {
  constructor(@Inject(AUTH_REPOSITORY) private readonly authRepository: IAuthRepository) {}

  async getById(id: string): Promise<Usuario> {
    const user = await this.authRepository.findById(id);
    if (!user) {
      throw new NotFoundException({ codigo: 'USER_NOT_FOUND', mensaje: 'Usuario no encontrado' });
    }
    return user;
  }

  /** HU_06: listado administrativo paginado. */
  async listar(
    filtros: FiltrosUsuario,
    paginacion: Paginacion,
  ): Promise<{ data: Usuario[]; meta: PaginacionMeta }> {
    const { data, total } = await this.authRepository.findAll(filtros, paginacion);
    const totalPaginas = Math.max(1, Math.ceil(total / paginacion.tamanioPagina));
    return {
      data,
      meta: {
        pagina: paginacion.pagina,
        tamanioPagina: paginacion.tamanioPagina,
        total,
        totalPaginas,
      },
    };
  }
}
