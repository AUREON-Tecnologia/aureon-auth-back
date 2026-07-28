import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSION_KEY } from '../decorators/require-permission.decorator';
import { JwtPayload } from '../decorators/current-user.decorator';
import { IRbacRepository, RBAC_REPOSITORY } from '../../modules/rbac/domain/repositories/rbac.repository.interface';

/** HU_13: autorizacion granular contra v_user_effective_permissions, complementaria a RolesGuard (legacy). */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(RBAC_REPOSITORY) private readonly rbacRepository: IRbacRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const permisoRequerido = this.reflector.getAllAndOverride<string | undefined>(PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!permisoRequerido) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{ user?: JwtPayload }>();
    const user = request.user;
    if (!user) {
      throw new UnauthorizedException({ codigo: 'UNAUTHORIZED', mensaje: 'No autenticado' });
    }

    const tienePermiso = await this.rbacRepository.tienePermisoEfectivo(
      user.sub,
      user.tenantId,
      permisoRequerido,
    );
    if (!tienePermiso) {
      throw new ForbiddenException({
        codigo: 'FORBIDDEN',
        mensaje: 'No tiene permisos suficientes para esta operacion',
      });
    }

    return true;
  }
}
