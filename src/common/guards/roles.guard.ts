import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { RolNegocio } from '../domain/rol-negocio';
import { JwtPayload } from '../decorators/current-user.decorator';

/** HU_06/HU_08: autorizacion por x-roles, debe usarse junto a JwtAuthGuard (que puebla request.user). */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const rolesRequeridos = this.reflector.getAllAndOverride<RolNegocio[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!rolesRequeridos || rolesRequeridos.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{ user?: JwtPayload }>();
    const user = request.user;
    if (!user) {
      throw new UnauthorizedException({ codigo: 'UNAUTHORIZED', mensaje: 'No autenticado' });
    }

    const autorizado = rolesRequeridos.some((rol) => user.roles.includes(rol));
    if (!autorizado) {
      throw new ForbiddenException({
        codigo: 'FORBIDDEN',
        mensaje: 'No tiene permisos suficientes para esta operacion',
      });
    }

    return true;
  }
}
