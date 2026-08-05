# STUB TEMPORAL — @aureon/redis-client

`package.json` apuntaba a `"@aureon/redis-client": "file:../aureon-redis-client"`, una carpeta
**hermana fuera de este repo** (`azure/aureon-redis-client`, ver ese repo/paquete para el diseño
real). Eso funciona en dev local porque las dos carpetas conviven en el mismo `azure/`, pero
**rompe cualquier build aislado de este repo** (Railway, CI, Docker build sin el resto del monorepo
de carpetas) con `Cannot find module '@aureon/redis-client'`, porque esa carpeta hermana
simplemente no existe fuera de la máquina de desarrollo.

Este paquete es un stub con el mismo nombre (`@aureon/redis-client`) y la misma interfaz pública
(`RedisModule`, `TokenBlacklistWriterService`, `TokenBlacklistReaderService`, `RedisService`, ...)
pero **sin conexión real a Redis**: `TokenBlacklistReaderService.isRevoked()` siempre devuelve
`false` y `TokenBlacklistWriterService.revoke()` no hace nada. Esto es exactamente el mismo
comportamiento fail-open que el diseño real ya soporta cuando Redis no responde (ver
`azure/aureon-redis-client/CLAUDE.md`), así que congelarlo así **no cambia la correctitud de nada**
— solo se pierde la revocación anticipada de logout (el access token sigue siendo válido hasta su
expiración natural, igual que antes de esta integración) mientras esté activo este stub.

## Cómo revertir (cuando Redis esté listo para desplegarse de verdad)

En `package.json` de este repo, cambiar:

```diff
- "@aureon/redis-client": "file:libs/redis-client-stub",
+ "@aureon/redis-client": "file:../aureon-redis-client",
```

(o a la versión publicada en un registro real, si ya se decidió el feed — ver el README del
paquete real) y volver a agregar `ioredis` como dependencia si se removió. Correr `npm install` y
confirmar que `common.module.ts` conecta contra un Redis real vía `REDIS_HOST`/`REDIS_PORT`. No
hace falta tocar ningún otro archivo de `src/` — todo el código consume `@aureon/redis-client` por
nombre, nunca por ruta, así que el swap es transparente.
