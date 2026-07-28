import { Inject, Injectable } from '@nestjs/common';
import { IRbacRepository, RBAC_REPOSITORY } from '../../domain/repositories/rbac.repository.interface';
import { ROLES_NEGOCIO, RolNegocio } from '../../../../common/domain/rol-negocio';
import { permisosLegacyDeRol } from '../../domain/permisos-catalogo-legacy';

/** HU_13: siembra los 5 roles legacy (is_system=true) + su catalogo de permisos al crear un tenant nuevo. */
@Injectable()
export class RbacSeedService {
  constructor(@Inject(RBAC_REPOSITORY) private readonly rbacRepository: IRbacRepository) {}

  async sembrarRolesLegacy(tenantId: string): Promise<Map<RolNegocio, string>> {
    const rolIdPorCodigo = new Map<RolNegocio, string>();
    const permisoIdPorCodigo = new Map<string, string>();

    for (const codigoRol of ROLES_NEGOCIO) {
      const rol = await this.rbacRepository.crearRol({
        tenantId,
        codigo: codigoRol,
        nombre: codigoRol,
        esSistema: true,
      });
      rolIdPorCodigo.set(codigoRol, rol.id);

      for (const codigoPermiso of permisosLegacyDeRol(codigoRol)) {
        let permisoId = permisoIdPorCodigo.get(codigoPermiso);
        if (!permisoId) {
          const [recurso, accion] = codigoPermiso.split(':');
          const permiso = await this.rbacRepository.crearPermiso({
            tenantId,
            codigo: codigoPermiso,
            nombre: codigoPermiso,
            recurso,
            accion,
          });
          permisoId = permiso.id;
          permisoIdPorCodigo.set(codigoPermiso, permisoId);
        }
        await this.rbacRepository.asignarPermisoARol(rol.id, permisoId);
      }
    }

    return rolIdPorCodigo;
  }
}
