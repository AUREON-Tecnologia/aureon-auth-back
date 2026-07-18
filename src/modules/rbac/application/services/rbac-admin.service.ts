import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { IRbacRepository, RBAC_REPOSITORY } from '../../domain/repositories/rbac.repository.interface';
import { Rol } from '../../domain/entities/rol.entity';
import { Permiso } from '../../domain/entities/permiso.entity';

export interface CrearRolInput {
  codigo: string;
  nombre: string;
  descripcion?: string;
}

export interface CrearPermisoInput {
  codigo: string;
  nombre: string;
  recurso: string;
  accion: string;
}

/**
 * HU_13: administracion de roles/permisos por tenant. No expone edicion/borrado de
 * roles `is_system=true` (protegidos por diseño, ver comentario del propio DDL) —
 * fuera de alcance de esta ronda; solo se crean roles/permisos nuevos y se asignan.
 */
@Injectable()
export class RbacAdminService {
  constructor(@Inject(RBAC_REPOSITORY) private readonly rbacRepository: IRbacRepository) {}

  async crearRol(tenantId: string, input: CrearRolInput): Promise<Rol> {
    const existente = await this.rbacRepository.buscarRolPorCodigo(tenantId, input.codigo);
    if (existente) {
      throw new ConflictException({
        codigo: 'ROL_YA_EXISTE',
        mensaje: 'Ya existe un rol con ese codigo en este tenant',
      });
    }
    return this.rbacRepository.crearRol({
      tenantId,
      codigo: input.codigo,
      nombre: input.nombre,
      descripcion: input.descripcion ?? null,
    });
  }

  listarRoles(tenantId: string): Promise<Rol[]> {
    return this.rbacRepository.listarRoles(tenantId);
  }

  crearPermiso(tenantId: string, input: CrearPermisoInput): Promise<Permiso> {
    return this.rbacRepository.crearPermiso({ tenantId, ...input });
  }

  listarPermisos(tenantId: string): Promise<Permiso[]> {
    return this.rbacRepository.listarPermisos(tenantId);
  }

  asignarPermisoARol(rolId: string, permisoId: string, otorgadoPor: string): Promise<void> {
    return this.rbacRepository.asignarPermisoARol(rolId, permisoId, otorgadoPor);
  }

  asignarPermisoDirecto(
    userId: string,
    permisoId: string,
    effect: 'ALLOW' | 'DENY',
    otorgadoPor: string,
    razon?: string,
  ): Promise<void> {
    return this.rbacRepository.asignarPermisoDirecto({
      userId,
      permisoId,
      effect,
      otorgadoPor,
      razon: razon ?? null,
    });
  }

  quitarPermisoDirecto(userId: string, permisoId: string): Promise<void> {
    return this.rbacRepository.quitarPermisoDirecto(userId, permisoId);
  }
}
