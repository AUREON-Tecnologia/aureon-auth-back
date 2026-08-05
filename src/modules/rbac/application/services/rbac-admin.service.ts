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
  moduloId: string;
  codigo: string;
  nombre: string;
}

/**
 * HU_13: administracion de roles (por tenant) y permisos (catalogo global,
 * agrupado por modulo — ver ModulosService para la gestion de modulos en si).
 * No expone edicion/borrado de roles `is_system=true` (protegidos por diseño).
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

  async crearPermiso(input: CrearPermisoInput): Promise<Permiso> {
    const existente = await this.rbacRepository.buscarPermisoPorCodigo(input.codigo);
    if (existente) {
      throw new ConflictException({
        codigo: 'PERMISO_YA_EXISTE',
        mensaje: 'Ya existe un permiso con ese codigo (el catalogo de permisos es global)',
      });
    }
    return this.rbacRepository.crearPermiso(input);
  }

  listarPermisos(): Promise<Permiso[]> {
    return this.rbacRepository.listarPermisos();
  }

  asignarPermisoARol(rolId: string, permisoId: string, otorgadoPor: string): Promise<void> {
    return this.rbacRepository.asignarPermisoARol(rolId, permisoId, otorgadoPor);
  }

  asignarPermisoDirecto(
    userId: string,
    tenantId: string,
    permisoId: string,
    effect: 'ALLOW' | 'DENY',
    otorgadoPor: string,
    razon?: string,
  ): Promise<void> {
    return this.rbacRepository.asignarPermisoDirecto({
      userId,
      tenantId,
      permisoId,
      effect,
      otorgadoPor,
      razon: razon ?? null,
    });
  }

  quitarPermisoDirecto(userId: string, tenantId: string, permisoId: string): Promise<void> {
    return this.rbacRepository.quitarPermisoDirecto(userId, tenantId, permisoId);
  }
}
