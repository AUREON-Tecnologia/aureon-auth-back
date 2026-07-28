import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { IRbacRepository, RBAC_REPOSITORY } from '../../domain/repositories/rbac.repository.interface';
import { Modulo } from '../../domain/entities/modulo.entity';
import { TenantModulo } from '../../domain/entities/tenant-modulo.entity';

export interface CrearModuloInput {
  codigo: string;
  nombre: string;
  descripcion?: string;
}

/**
 * HU_13: los modulos son el catalogo global de "features" que un tenant puede
 * licenciar. Crear un modulo nuevo (y sus permisos) es una operacion de
 * plataforma (ver ModulosController, protegido por PlatformBootstrapGuard) — un
 * admin de tenant solo puede ver el catalogo y activar/desactivar modulos para
 * SU PROPIO tenant, nunca crear modulos nuevos (contaminaria el catalogo
 * compartido por todos los demas tenants).
 */
@Injectable()
export class ModulosService {
  constructor(@Inject(RBAC_REPOSITORY) private readonly rbacRepository: IRbacRepository) {}

  async crearModulo(input: CrearModuloInput): Promise<Modulo> {
    const existente = await this.rbacRepository.buscarModuloPorCodigo(input.codigo);
    if (existente) {
      throw new ConflictException({
        codigo: 'MODULO_YA_EXISTE',
        mensaje: 'Ya existe un modulo con ese codigo',
      });
    }
    return this.rbacRepository.crearModulo(input);
  }

  listarModulos(): Promise<Modulo[]> {
    return this.rbacRepository.listarModulos();
  }

  listarModulosDeTenant(tenantId: string): Promise<TenantModulo[]> {
    return this.rbacRepository.listarModulosDeTenant(tenantId);
  }

  activarModuloParaTenant(tenantId: string, moduloId: string): Promise<TenantModulo> {
    return this.rbacRepository.activarModuloParaTenant(tenantId, moduloId);
  }

  desactivarModuloParaTenant(tenantId: string, moduloId: string): Promise<void> {
    return this.rbacRepository.desactivarModuloParaTenant(tenantId, moduloId);
  }
}
