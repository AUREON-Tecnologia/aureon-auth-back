import * as Joi from 'joi';

export const validationSchema = Joi.object({
  PORT: Joi.number().default(3001),
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  DATABASE_URL: Joi.string().uri().required(),
  DIRECT_URL: Joi.string().uri().required(),
  JWT_SECRET: Joi.string().min(32).required(),
  JWT_EXPIRES_IN: Joi.string().default('30m'),
  JWT_REFRESH_EXPIRES_IN_DIAS: Joi.number().integer().min(1).default(30),
  AUTH_MAX_INTENTOS_FALLIDOS: Joi.number().integer().min(1).default(5),
  AUTH_BLOQUEO_MINUTOS: Joi.number().integer().min(1).default(15),
  USER_TOKEN_EXPIRA_MINUTOS: Joi.number().integer().min(1).default(30),
  PLATFORM_BOOTSTRAP_KEY: Joi.string().min(16).required(),
  PLATFORM_DEFAULT_ROLE_CODE: Joi.string().default('cliente'),
  SERVICE_NAME: Joi.string().default('auth-service'),
  REDIS_HOST: Joi.string().default('localhost'),
  REDIS_PORT: Joi.number().default(6379),
  REDIS_PASSWORD: Joi.string().allow('').optional(),
  REDIS_DB: Joi.number().default(0),
  REDIS_KEY_PREFIX: Joi.string().default('identity'),
  COOKIE_DOMAIN: Joi.string().allow('').optional(),
  COOKIE_SAMESITE: Joi.string().valid('lax', 'strict', 'none').default('none'),
  COOKIE_SECURE: Joi.string().valid('true', 'false').default('true'),
  // Not .required(): cookie.config.ts falls back to the real frontend URL
  // hardcoded, so the service still boots correctly if this isn't set in
  // Railway (see that file's comment for why). Still validated as a proper
  // URI if it IS present, to catch typos.
  FRONTEND_ORIGIN: Joi.string().uri().optional(),
});
