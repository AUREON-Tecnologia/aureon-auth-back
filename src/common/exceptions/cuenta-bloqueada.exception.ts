import { HttpException } from '@nestjs/common';

/**
 * HU_04: 423 definido por auth.yaml#LockedAccountError para login/refresh bloqueados.
 * `codigo` usa el valor `LOCKED_ACCOUNT` documentado en el contrato (no el literal
 * `CUENTA_BLOQUEADA` que emitia antes) y el campo de fecha es `lockedUntil` (ingles,
 * igual que el resto de campos propios de este modulo). El campo `mensaje` en si
 * (nombre) sigue viniendo de `common.yaml#Error`, compartido con el resto de
 * modulos — pero su contenido, dentro del alcance de auth.yaml, va en ingles
 * (decision 2026-08-15: nada expuesto por /auth/* queda en espanol).
 */
export class CuentaBloqueadaException extends HttpException {
  constructor(bloqueadoHasta: Date) {
    super(
      {
        codigo: 'LOCKED_ACCOUNT',
        mensaje: 'Account temporarily locked for exceeding the maximum number of allowed failed attempts',
        lockedUntil: bloqueadoHasta.toISOString(),
      },
      423,
    );
  }
}
