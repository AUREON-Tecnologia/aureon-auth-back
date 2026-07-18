import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  AUTH_REPOSITORY,
  IAuthRepository,
} from '../../domain/repositories/auth.repository.interface';
import { Usuario } from '../../domain/entities/usuario.entity';
import { AuditLogService } from '../../../../common/services/audit-log.service';

export interface ActualizarUsuarioInput {
  telefono?: string;
  idUsuarioRol?: string;
  activo?: boolean;
}

/** HU_06: gestion administrativa de usuarios internos (fuera del ciclo login/register/refresh). */
@Injectable()
export class UsuarioCommandService {
  constructor(
    @Inject(AUTH_REPOSITORY) private readonly authRepository: IAuthRepository,
    private readonly auditLog: AuditLogService,
  ) {}

  async actualizar(id: string, input: ActualizarUsuarioInput, actorId: string): Promise<Usuario> {
    await this.exigirExistente(id);
    const actualizado = await this.authRepository.update(id, input);
    this.auditLog.registrar({
      evento: 'USUARIO_ACTUALIZADO',
      usuarioId: id,
      actorId,
      detalle: { ...input },
    });
    return actualizado;
  }

  /** Baja logica (activo=false), nunca fisica — idempotente si ya estaba inactivo. */
  async desactivar(id: string, actorId: string): Promise<Usuario> {
    const existente = await this.exigirExistente(id);
    if (!existente.activo) {
      return existente;
    }
    const actualizado = await this.authRepository.update(id, { activo: false });
    this.auditLog.registrar({ evento: 'USUARIO_DESACTIVADO', usuarioId: id, actorId });
    return actualizado;
  }

  private async exigirExistente(id: string): Promise<Usuario> {
    const existente = await this.authRepository.findById(id);
    if (!existente) {
      throw new NotFoundException({ codigo: 'USER_NOT_FOUND', mensaje: 'Usuario no encontrado' });
    }
    return existente;
  }
}
