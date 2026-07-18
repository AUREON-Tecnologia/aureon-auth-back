# CLAUDE.md

Guía de contexto para trabajar sobre **aureon-auth-back**. Generada por análisis directo del código; actualizada tras implementar las 12 HU del backlog funcional (`BACKLOG_FUNCIONAL.md`, `docus/desarrollo-ia/auth/hus/` en el repo `openapi`) en la rama `feature/hu-01-12-auth-completo`.

## Qué es este repo

Microservicio NestJS de autenticación para AUREON (`auth-service`). Repo independiente en Azure DevOps (`Proyecto-Aureon/AUREON/_git/aureon-auth-back`), rama por defecto `main`.

Repos hermanos:
- `azure/aureon_api_contracts` — contratos OpenAPI (`auth.yaml` es el contrato de este servicio).
- `azure/clients_backend/workshop-clients-back` — otro microservicio backend (hexagonal, UseCase/Service en inglés).
- `openapi/docus/scripts-v2/aureon_ddl_01_identity.sql` — **DDL real y autoritativo** del schema `identity` que este servicio usa. Ante cualquier duda sobre nombres de columna o estructura de tabla, ese archivo es la fuente de verdad, no las suposiciones de este documento ni del código anterior a esta rama (que tenía nombres de columna incorrectos, ver "Correcciones" abajo).

## Stack

- NestJS 11 + TypeScript strict.
- `@supabase/supabase-js` — sin ORM, sin migraciones en este repo (las migraciones viven en `openapi/docus/scripts-v2/`).
- `@nestjs/jwt` (access token JWT) + `bcryptjs` (hash de password) + `crypto` nativo de Node (refresh tokens opacos y OTP, sin dependencias nuevas).
- `class-validator`/`class-transformer` para DTOs. `joi` para validar env vars al boot.
- Jest para unit tests. `test:e2e` sigue sin configurar (fuera de alcance de esta ronda).

## Modelo de tokens (HU_01/02/03)

- **Access token**: JWT firmado, corta duración (`JWT_EXPIRES_IN`, default `30m`). `sub` = `usuario.id` (UUID real, **no** `numero_identificacion`).
- **Refresh token**: opaco (`crypto.randomBytes`), vida larga (`JWT_REFRESH_EXPIRES_IN_DIAS`, default `30`). Se persiste solo su hash SHA-256 en `identity.sesion_usuario.token_hash`. Rotación en cada uso (`POST /auth/refresh`): el token usado queda `activa=false` y se emite un par nuevo. `POST /auth/logout` revoca explícitamente, idempotente.
- Ningún valor de expiración viene dado por el ERS (RNF-008 los deja "por definir por el equipo", ver `docus/CONTEXTO_PROYECTO.md` §15) — los defaults de arriba son una decisión de este equipo, documentada aquí y en `.env.example`, no una exigencia normativa.

## Seguridad (HU_04/HU_05)

- Bloqueo por intentos fallidos usando `usuario.intentos_fallidos`/`bloqueado_hasta` (columnas reales del DDL, antes sin usar). Umbral `AUTH_MAX_INTENTOS_FALLIDOS` (default 5), duración `AUTH_BLOQUEO_MINUTOS` (default 15). Responde `423` con el shape `CuentaBloqueadaError` de `auth.yaml` (`CuentaBloqueadaException`).
- Login con cuenta ya bloqueada no ejecuta `bcrypt.compare` (evita timing/CPU innecesarios).
- Política de contraseña en registro: mínimo 8 caracteres, al menos una letra, un número y un carácter especial (`RegisterDto`).

## Roles (HU_07)

`identity.usuario_rol.nombre` (catálogo libre en BD, con `nivel_permisos` 1–10) se resuelve 1:1 contra el enum fijo de `x-roles` (`administrador`, `tecnico`, `administrativo`, `cliente`, `sistema`) vía `src/common/domain/rol-negocio.ts`. Si el nombre de un rol en BD no coincide exactamente con uno de esos 5 valores, `resolverRolNegocio` lanza un error explícito — **no** emite un JWT con un rol no reconocible por el resto de microservicios. `nivel_permisos` queda como atributo secundario en BD, no se usa todavía para nada (ver HU_12 más abajo). Esta es la decisión de la Opción A documentada en `docus/desarrollo-ia/auth/hus/HU_07.md`; validar contra el catálogo real de `usuario_rol` en desarrollo antes de sembrar datos con nombres distintos.

## Gestión administrativa de usuarios (HU_06)

`GET/PATCH/DELETE /auth/usuarios` (+`GET /auth/usuarios/:id`), protegidos con `@Roles('administrador')` vía `RolesGuard` (`src/common/guards/roles.guard.ts`, usa `Reflector` + decorador `@Roles(...)`). `DELETE` es baja lógica (`activo=false`, `200` con el recurso, idempotente) — nunca borrado físico. Campos inmutables (`numeroIdentificacion`, `idTipoNumeroIdentificacion`, `email`) simplemente no existen en `ActualizarUsuarioDto`; `forbidNonWhitelisted: true` rechaza cualquier intento de enviarlos.

**Pendiente de decidir** (no resuelto en esta ronda): si `POST /auth/register` sigue siendo público o pasa a requerir `administrador` ahora que existe este CRUD — se dejó el registro público sin cambios porque no hay una señal clara del Product Owner sobre qué rol se autoregistra por ese endpoint.

## OTP (HU_08/HU_09)

Módulo nuevo `src/modules/otp/`, independiente de `modules/auth`, usando `identity.token_verificacion`. `POST /auth/otp` (emitir) y `POST /auth/otp/verificar`, ambos `@Roles('sistema')` — pensado para que el backend del asistente virtual (todavía no existe como servicio) se autentique como rol `sistema` contra este mismo auth-service antes de invocarlos.

Limitaciones conocidas y deliberadas (no arregladas porque requieren tocar el DDL compartido, fuera de alcance):
- El código OTP se guarda tal cual en la columna `token varchar(8)` (así está definida en el DDL, sin columna de hash) — no hay `intentos_verificacion` en la tabla, así que el límite de intentos de verificación descrito en `HU_09.md` **no está implementado**; la única mitigación real es expiración corta (`OTP_EXPIRA_MINUTOS`, default 5) + un solo uso.
- El envío real por WhatsApp/correo no existe (no hay integración de notificaciones en ningún repo todavía) — `OtpService.emitir` solo persiste y audita, delega el envío a un servicio que aún no se ha construido.

## Auditoría (HU_10)

`AuditLogService` (`src/common/services/audit-log.service.ts`, global vía `CommonModule`) — logs estructurados JSON vía el `Logger` de Nest (no tabla de BD). Cubre login éxito/fallo, bloqueo de cuenta, logout, refresh, alta/edición/baja de usuario, emisión/verificación de OTP. Nunca incluye contraseñas, tokens ni códigos OTP en el detalle.

## Forma de respuesta y error (HU_11)

- **Error**: `GlobalExceptionFilter` reescrito para emitir `{codigo, mensaje, detalles?}` (antes `{success, statusCode, error, message, timestamp, path}`), alineado con `common.yaml#Error`. El `423` de cuenta bloqueada añade `bloqueadoHasta`.
- **Éxito**: se **eliminó** `ResponseInterceptor` (la envoltura genérica `{success, statusCode, data, timestamp, path}`). Decisión tomada porque el contrato no la modela en ningún lado y ningún otro repo hermano confirmó esa convención como estándar de plataforma — si en el futuro se confirma que sí lo es, revertir esta decisión y actualizar `auth.yaml` para documentarla explícitamente en vez de al revés.
- `POST /auth/login`/`refresh` devuelven `LoginResponseDto` (`token`, `tipoToken`, `expiraEn`, `refreshToken`, `refreshExpiraEn`, `usuario`, `permisos`) — nombres exactos del contrato. `GET /auth/me` y el CRUD de usuarios devuelven `UsuarioAutenticadoDto` (`id`, `correo`, `rol`, `clienteId`, `tecnicoId`, `activo`).
- **`usuario.id` es UUID real** (columna del DDL, antes ausente del dominio) — resuelve la inconsistencia que se había señalado entre el contrato (`id: uuid`) y el modelo (`numeroIdentificacion`). El `sub` del JWT también cambió a este `id`, no al número de documento.
- **Sigue sin existir** en el modelo de datos: `nombre` (persona), `clienteId`, `tecnicoId`. `UsuarioAutenticadoDto` los omite/`null` porque el DDL de `identity.usuario` no los tiene — no se inventó ninguna columna nueva. Si se necesitan, requiere una migración coordinada con quien mantiene `scripts-v2/`.

## Permisos efectivos (HU_12)

`src/modules/auth/domain/permisos-catalogo.ts` — catálogo estático `rol → permisos[]`, deliberadamente mínimo (solo cubre `clientes:*`, ya que es el único módulo de negocio con contrato hoy — ver `docus/CONTEXTO_PROYECTO.md` §14, 62 de 68 RF sin contrato). Se debe extender módulo por módulo conforme existan más contratos OpenAPI; no es exhaustivo ni definitivo.

## Correcciones sobre el estado anterior (bugs reales encontrados al cruzar con el DDL)

El código previo a esta rama tenía nombres de columna que **no existen** en `identity.usuario` según el DDL real (`docus/scripts-v2/aureon_ddl_01_identity.sql`): usaba `contrasena` (la columna real es `password_hash`) y `fecha_creacion` (la columna real es `created_at`), y no tenía ningún campo `id` en el dominio pese a que `usuario.id` es la PK real de la tabla (se usaba `numero_identificacion` como si fuera el identificador único, cuando en realidad es solo una `UNIQUE`, no la PK). Todo esto se corrigió como parte de HU_01/HU_11 al necesitar `id` para las sesiones.

## Estructura actualizada

```
src/
  common/
    domain/rol-negocio.ts, paginacion-meta.ts
    guards/jwt-auth.guard.ts, roles.guard.ts
    decorators/current-user.decorator.ts, roles.decorator.ts
    exceptions/cuenta-bloqueada.exception.ts
    services/audit-log.service.ts          (global via CommonModule)
    supabase/supabase-client.provider.ts, supabase.module.ts   (cliente Supabase compartido, global)
    utils/duration.util.ts
    filters/global-exception.filter.ts
  config/  app, jwt, supabase, security (nuevo), validation.schema
  modules/
    health/
    auth/
      domain/         entities (Usuario con id/intentosFallidos/bloqueadoHasta/ultimoAcceso), repositories (auth + session), permisos-catalogo.ts
      infrastructure/ supabase-auth.repository.ts, supabase-session.repository.ts
      application/    auth-command.service.ts (register/login/refresh/logout), auth-query.service.ts (getById/listar), usuario-command.service.ts (actualizar/desactivar), token.service.ts
      presentation/   auth.controller.ts, usuarios.controller.ts, dto/, mappers/login-response.mapper.ts
    otp/
      domain/ infrastructure/ application/ presentation/  (mismo patrón hexagonal, tabla token_verificacion)
```

## Pendiente real para una siguiente ronda

- **Node.js 22**: `@supabase/supabase-js` (resuelto en `package-lock.json` a `2.110.0`) requiere Node ≥22 para el cliente realtime (WebSocket nativo); este entorno y el `docker/Dockerfile` (`node:20-alpine`) están en Node 20. Al arrancar la app con variables reales se puede reproducir el fallo (`WebSocketFactory... native WebSocket not found`). Esto es preexistente a esta rama (el código original ya llamaba `createClient` igual) y no se resolvió aquí — requiere decidir entre subir el Node del Dockerfile/pipeline a 22, o fijar `@supabase/supabase-js` a una versión compatible con Node 20.
- Decisión pendiente sobre `POST /auth/register` (público vs. `administrador`-only) — ver HU_06 arriba.
- Límite de intentos de verificación de OTP no implementado (requiere columna nueva en `token_verificacion`, ver HU_09).
- Catálogo de permisos (HU_12) es un punto de partida, no está completo.
- `IdempotencyKeyHeader` (convención transversal de `CLAUDE.md` raíz del monorepo de contratos) todavía no se aplicó a `POST /auth/register` — no estaba en el alcance de ninguna de las 12 HU trabajadas, quedó fuera deliberadamente.
