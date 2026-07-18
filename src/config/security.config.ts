import { registerAs } from '@nestjs/config';

/**
 * Valores por defecto elegidos por el equipo de desarrollo — RNF-008 exige estas
 * politicas pero el ERS deja los umbrales explicitamente sin definir (ver
 * docus/CONTEXTO_PROYECTO.md seccion 15). Todos son configurables por entorno.
 */
export default registerAs('security', () => ({
  maxIntentosFallidos: parseInt(process.env.AUTH_MAX_INTENTOS_FALLIDOS ?? '5', 10),
  bloqueoMinutos: parseInt(process.env.AUTH_BLOQUEO_MINUTOS ?? '15', 10),
  refreshExpiresInDias: parseInt(process.env.JWT_REFRESH_EXPIRES_IN_DIAS ?? '30', 10),
  otpExpiraMinutos: parseInt(process.env.OTP_EXPIRA_MINUTOS ?? '5', 10),
}));
