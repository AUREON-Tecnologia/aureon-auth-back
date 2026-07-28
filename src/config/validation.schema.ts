import * as Joi from 'joi';

export const validationSchema = Joi.object({
  PORT: Joi.number().default(3001),
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  SUPABASE_URL: Joi.string().uri().required(),
  SUPABASE_SERVICE_ROLE_KEY: Joi.string().required(),
  JWT_SECRET: Joi.string().min(32).required(),
  JWT_EXPIRES_IN: Joi.string().default('30m'),
  JWT_REFRESH_EXPIRES_IN_DIAS: Joi.number().integer().min(1).default(30),
  AUTH_MAX_INTENTOS_FALLIDOS: Joi.number().integer().min(1).default(5),
  AUTH_BLOQUEO_MINUTOS: Joi.number().integer().min(1).default(15),
  USER_TOKEN_EXPIRA_MINUTOS: Joi.number().integer().min(1).default(30),
  PLATFORM_BOOTSTRAP_KEY: Joi.string().min(16).required(),
  PLATFORM_DEFAULT_ROLE_CODE: Joi.string().default('cliente'),
  SERVICE_NAME: Joi.string().default('auth-service'),
});
