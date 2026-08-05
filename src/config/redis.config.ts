import { registerAs } from '@nestjs/config';

export default registerAs('redis', () => ({
  host: process.env.REDIS_HOST ?? 'localhost',
  port: Number(process.env.REDIS_PORT ?? 6379),
  password: process.env.REDIS_PASSWORD || undefined,
  db: Number(process.env.REDIS_DB ?? 0),
  // Namespace de las keys propias de este servicio (no el de la blacklist de
  // tokens, que usa un namespace fijo compartido, ver @aureon/redis-client).
  keyPrefix: process.env.REDIS_KEY_PREFIX ?? 'identity',
}));
