const UNIDADES_MS: Record<string, number> = {
  s: 1000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
};

/** Acepta "30", "30m", "1h", "7d" (segundos si es solo digitos, o numero+unidad). */
export function parseDurationToMs(valor: string): number {
  if (/^\d+$/.test(valor)) {
    return Number(valor) * 1000;
  }
  const match = /^(\d+)(s|m|h|d)$/.exec(valor);
  if (!match) {
    throw new Error(`Formato de duracion invalido: ${valor}`);
  }
  return Number(match[1]) * UNIDADES_MS[match[2]];
}
