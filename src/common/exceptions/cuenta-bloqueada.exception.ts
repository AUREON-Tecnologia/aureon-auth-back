import { HttpException } from '@nestjs/common';

/** HU_04: 423 definido por auth.yaml (CuentaBloqueadaError) para login/refresh bloqueados. */
export class CuentaBloqueadaException extends HttpException {
  constructor(bloqueadoHasta: Date) {
    super(
      {
        codigo: 'CUENTA_BLOQUEADA',
        mensaje:
          'Cuenta bloqueada temporalmente por exceder el numero maximo de intentos fallidos permitidos',
        bloqueadoHasta: bloqueadoHasta.toISOString(),
      },
      423,
    );
  }
}
