import { registerAs } from '@nestjs/config';

export default registerAs('jwt', () => ({
  secret: process.env.JWT_SECRET ?? 'change-me-in-production',
  // HU_03: access token de vida corta — el refresh token (JWT_REFRESH_EXPIRES_IN_DIAS,
  // ver security.config.ts) es el que sostiene la sesion de vida larga.
  expiresIn: process.env.JWT_EXPIRES_IN ?? '30m',
}));
