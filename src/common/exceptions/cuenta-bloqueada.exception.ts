import { HttpException } from '@nestjs/common';

/**
 * HU_04: 423 definido por auth.yaml#LockedAccountError para login/refresh bloqueados.
 * `codigo` usa el valor `LOCKED_ACCOUNT` documentado en el contrato (no el literal
 * `CUENTA_BLOQUEADA` que emitia antes) y el campo de fecha es `lockedUntil` (ingles,
 * igual que el resto de campos propios de este modulo) — `mensaje` se queda en
 * espanol porque viene de `common.yaml#Error`, compartido con el resto de modulos.
 */
export class CuentaBloqueadaException extends HttpException {
  constructor(bloqueadoHasta: Date) {
    super(
      {
        codigo: 'LOCKED_ACCOUNT',
        mensaje:
          'Cuenta bloqueada temporalmente por exceder el numero maximo de intentos fallidos permitidos',
        lockedUntil: bloqueadoHasta.toISOString(),
      },
      423,
    );
  }
}
