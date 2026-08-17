import { registerAs } from '@nestjs/config';

export default registerAs('app', () => {
  const nodeEnv = process.env.NODE_ENV ?? 'development';

  return {
    port: parseInt(process.env.PORT ?? '3001', 10),
    nodeEnv,
    serviceName: process.env.SERVICE_NAME ?? 'auth-service',
    /**
     * If CORS_ALLOW_ALL_ORIGINS is set explicitly (true/false), that wins in
     * any environment. If it's unset (the expected case until it's added to
     * Railway), the default depends on nodeEnv: open in anything that isn't
     * 'production', closed (falls back to cookie.frontendOrigin) in
     * 'production' — so a deploy that never gets this var stays closed by
     * default once nodeEnv is actually set to 'production' there.
     */
    corsAllowAllOrigins:
      process.env.CORS_ALLOW_ALL_ORIGINS !== undefined
        ? process.env.CORS_ALLOW_ALL_ORIGINS === 'true'
        : nodeEnv !== 'production',
  };
});