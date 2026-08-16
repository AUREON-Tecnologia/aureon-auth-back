import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

/** Forma exigida por common.yaml#Error (codigo, mensaje, detalles?) + lockedUntil (auth.yaml#LockedAccountError). */
interface ErrorResponseBody {
  codigo: string;
  mensaje: string;
  detalles?: string[];
  lockedUntil?: string;
}

const CODIGO_POR_ESTADO: Record<number, string> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  422: 'UNPROCESSABLE_ENTITY',
  423: 'LOCKED_ACCOUNT',
  429: 'TOO_MANY_REQUESTS',
  500: 'INTERNAL_SERVER_ERROR',
};

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let body: ErrorResponseBody = {
      codigo: 'INTERNAL_SERVER_ERROR',
      mensaje: 'Internal server error',
    };

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();

      if (typeof res === 'string') {
        body = { codigo: CODIGO_POR_ESTADO[status] ?? 'ERROR', mensaje: res };
      } else if (typeof res === 'object' && res !== null) {
        const r = res as Record<string, unknown>;
        const mensajeCrudo = r.mensaje ?? r.message;

        if (Array.isArray(mensajeCrudo)) {
          body = {
            codigo: (r.codigo as string) ?? CODIGO_POR_ESTADO[status] ?? 'ERROR',
            mensaje: 'The request failed validation',
            detalles: mensajeCrudo as string[],
          };
        } else {
          body = {
            codigo: (r.codigo as string) ?? CODIGO_POR_ESTADO[status] ?? 'ERROR',
            mensaje: (mensajeCrudo as string) ?? exception.message,
          };
          if (typeof r.lockedUntil === 'string') {
            body.lockedUntil = r.lockedUntil;
          }
        }
      }
    }

    if (status >= 500) {
      this.logger.error(
        `${request.method} ${request.url} -> ${status} ${body.codigo}: ${body.mensaje}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    response.status(status).json(body);
  }
}
