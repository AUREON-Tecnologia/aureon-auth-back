import { Inject, Injectable } from '@nestjs/common';
import { IRbacRepository, RBAC_REPOSITORY } from '../../domain/repositories/rbac.repository.interface';
import { ROLES_NEGOCIO, RolNegocio } from '../../../../common/domain/rol-negocio';
import { MODULOS_LEGACY_SEED, permisosLegacyDeRol } from '../../domain/permisos-catalogo-legacy';

/**
 * HU_13: siembra el catalogo global (modulos + permisos, find-or-create — se
 * comparte entre todos los tenants), activa esos modulos para el tenant nuevo
 * (requerido por los triggers de BD antes de poder asignar sus permisos), y crea
 * los 5 roles legacy (is_system=true) con sus permisos ya asignados.
 */
@Injectable()
export class RbacSeedService {
  constructor(@Inject(RBAC_REPOSITORY) private readonly rbacRepository: IRbacRepository) {}

  async sembrarRolesLegacy(tenantId: string): Promise<Map<RolNegocio, string>> {
    const { moduloIdPorCodigo, permisoIdPorCodigo } = await this.asegurarCatalogoGlobal();

    for (const moduloId of moduloIdPorCodigo.values()) {
      await this.rbacRepository.activarModuloParaTenant(tenantId, moduloId);
    }

    const rolIdPorCodigo = new Map<RolNegocio, string>();
    for (const codigoRol of ROLES_NEGOCIO) {
      const rol = await this.rbacRepository.crearRol({
        tenantId,
        codigo: codigoRol,
        nombre: codigoRol,
        esSistema: true,
      });
      rolIdPorCodigo.set(codigoRol, rol.id);

      for (const codigoPermiso of permisosLegacyDeRol(codigoRol)) {
        const permisoId = permisoIdPorCodigo.get(codigoPermiso);
        if (permisoId) {
          await this.rbacRepository.asignarPermisoARol(rol.id, permisoId);
        }
      }
    }

    return rolIdPorCodigo;
  }

  private async asegurarCatalogoGlobal(): Promise<{
    moduloIdPorCodigo: Map<string, string>;
    permisoIdPorCodigo: Map<string, string>;
  }> {
    const moduloIdPorCodigo = new Map<string, string>();
    const permisoIdPorCodigo = new Map<string, string>();

    for (const modulo of MODULOS_LEGACY_SEED) {
      let moduloExistente = await this.rbacRepository.buscarModuloPorCodigo(modulo.codigo);
      if (!moduloExistente) {
        moduloExistente = await this.rbacRepository.crearModulo({
          codigo: modulo.codigo,
          nombre: modulo.nombre,
        });
      }
      moduloIdPorCodigo.set(modulo.codigo, moduloExistente.id);

      for (const permiso of modulo.permisos) {
        let permisoExistente = await this.rbacRepository.buscarPermisoPorCodigo(permiso.codigo);
        if (!permisoExistente) {
          permisoExistente = await this.rbacRepository.crearPermiso({
            moduloId: moduloExistente.id,
            codigo: permiso.codigo,
            nombre: permiso.nombre,
          });
        }
        permisoIdPorCodigo.set(permiso.codigo, permisoExistente.id);
      }
    }

    return { moduloIdPorCodigo, permisoIdPorCodigo };
  }
}
