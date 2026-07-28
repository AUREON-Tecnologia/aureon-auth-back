import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

const HEADER_BOOTSTRAP_KEY = 'x-platform-bootstrap-key';

/** HU_13: protege POST /tenants — el schema no modela un rol "super-admin de plataforma" separado de los roles por tenant. */
@Injectable()
export class PlatformBootstrapGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const header = request.headers[HEADER_BOOTSTRAP_KEY];
    const esperado = this.configService.get<string>('platform.bootstrapKey');

    if (!esperado) {
      throw new ForbiddenException({
        codigo: 'FORBIDDEN',
        mensaje: 'Creacion de tenants deshabilitada: PLATFORM_BOOTSTRAP_KEY no configurado',
      });
    }

    if (!header || typeof header !== 'string' || header !== esperado) {
      throw new ForbiddenException({ codigo: 'FORBIDDEN', mensaje: 'Clave de bootstrap invalida' });
    }

    return true;
  }
}
