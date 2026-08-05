# CLAUDE.md

Guía de contexto para trabajar sobre **aureon-auth-back**. Reescrita tras la migración al esquema v3 (rama `feature/hu-13-migracion-multi-tenant-rbac`, partiendo de `feature/hu-01-12-auth-completo`) — **el modelo de datos cambió por completo**, no es una evolución del anterior.

## Qué es este repo ahora

Microservicio NestJS de autenticación, **multi-tenant** con RBAC dinámico (roles y permisos por tenant, más permisos directos ALLOW/DENY por usuario). Repo independiente en Azure DevOps (`Proyecto-Aureon/AUREON/_git/aureon-auth-back`).

**El DDL autoritativo es `openapi/docus/scripts-v3/scripts-auth.sql`** (reemplaza `scripts-v2/aureon_ddl_01_identity.sql`, que queda obsoleto para este servicio). Tablas: `tenants`, `users` (global, sin campo de rol propio), `permissions`/`roles`/`role_permissions` (todo scoped por `tenant_id`), `user_tenant_memberships` (un rol por usuario por tenant), `user_permissions` (overrides ALLOW/DENY directos), `user_sessions` (refresh token opaco), `user_tokens` (EMAIL_VERIFICATION/PASSWORD_RESET/MFA_SETUP), vista `v_user_effective_permissions`.

## Por qué el pivote (decisiones confirmadas con el usuario antes de migrar)

1. **Multi-tenant real**: varios negocios comparten este auth-service, no una única instalación de taller por deploy.
2. **Login identifica el tenant vía un campo en el body** (`tenantCode`), no header ni subdominio.
3. **El módulo OTP de cliente (HU_08/09 de la ronda anterior) se eliminó por completo** — `identity.token_verificacion` ya no existe; `user_tokens` tiene un propósito distinto (self-service del propio usuario interno: verificar su email, resetear su password, iniciar configuración de MFA), no OTP de WhatsApp para clientes/asistente virtual.
4. **Los 5 roles legacy (`administrador/tecnico/administrativo/cliente/sistema`) se siembran como `is_system=true` en cada tenant nuevo**, y el JWT sigue emitiendo el `code` real de la membresía en `roles` — para tenants que solo usan los roles sembrados, esto es compatible con el resto del ecosistema AUREON (`x-roles`). Un tenant puede crear roles propios vía el módulo `rbac`; en ese caso el JWT emite ese código real y el resto del ecosistema simplemente no lo reconocerá todavía (esperado, no es un error).
5. **`POST /tenants` se protege con un secreto compartido** (`PLATFORM_BOOTSTRAP_KEY`, header `X-Platform-Bootstrap-Key`) — el schema no modela un rol de "super-admin de plataforma" separado de los roles por tenant.

Detalle completo de estas decisiones y del análisis de brecha: `C:\Users\ginfa\.claude\plans\iterative-skipping-engelbart.md` (plan de la migración) — no versionado en git, referencia local de esta máquina.

## Endpoints

**`AuthController`** (`/auth`) — público salvo `/me`:
- `POST /auth/register` — requiere `tenantCode`; solo crea usuarios **globales nuevos** (si el email ya existe en cualquier tenant, `409`). Unirse a un tenant adicional con una cuenta existente no está expuesto vía auto-registro público en esta ronda (requeriría probar posesión de la cuenta primero).
- `POST /auth/login` — requiere `email`+`password`+`tenantCode`.
- `POST /auth/refresh`, `POST /auth/logout` — igual que antes (refresh token opaco con rotación); `logout` además blacklistea en Redis el access token vigente si viene en `Authorization` (ver "Blacklist de revocación temprana" más abajo).
- `GET /auth/me` (JWT) — usa `tenantId`/`roles[0]` del propio JWT, no relee la membresía.

**`PasswordResetController`** (`/auth/password`, público): `POST /olvide`, `POST /restablecer` — reset invalida todas las sesiones del usuario al completarse.

**`SelfServiceController`** (`/auth`): `POST /email/verificar` (público), `POST /email/reenviar-verificacion` (JWT), `POST /mfa/iniciar-configuracion` (JWT, **solo el plumbing del token de un solo uso — no hay TOTP real implementado**, ver "Fuera de alcance").

**`TenantsController`** (`/tenants`, protegido por `PlatformBootstrapGuard`): `POST /` (crea tenant + siembra roles legacy + primer admin), `GET /`, `GET /:id`.

**`RolesController`/`PermisosController`/`MembresiasController`** (`/rbac/...`, JWT + `@Roles('administrador')`, scoped siempre al `tenantId` del JWT, nunca a un parámetro de la URL):
- `GET/POST /rbac/roles`, `POST /rbac/roles/:id/permisos`
- `GET/POST /rbac/permisos`, `POST/DELETE /rbac/permisos/usuarios/:userId[/:permisoId]` (ALLOW/DENY directo)
- `GET/GET:id/PATCH/DELETE /rbac/membresias` — reemplaza el CRUD de "usuarios" de la ronda anterior; `DELETE` desactiva la **membresía a ese tenant**, nunca el usuario global (podría pertenecer a otros tenants).

## Modelo de tokens (sin cambios de fondo respecto a la ronda anterior)

Access JWT corto (`JWT_EXPIRES_IN`, default `30m`) + refresh token opaco de vida larga (`JWT_REFRESH_EXPIRES_IN_DIAS`, default `30`, hash en `user_sessions.refresh_token_hash`, rotación en cada uso). Lo que cambió: `sub` del JWT sigue siendo `users.id`, pero ahora el payload también lleva `tenantId` (obligatorio, define contra qué tenant se resuelve todo lo demás en cada request).

### Blacklist de revocación temprana del access JWT (Redis)

El access JWT ahora lleva `jti` (uuid). `POST /auth/logout` sigue sin requerir `Authorization` (el `refreshToken` sigue siendo la única credencial obligatoria, ver historia HU-AUTH-02 en `BACKLOG_FUNCIONAL.md`) — pero si el cliente manda el access token vigente en el header, `AuthCommandService.logout` lo decodifica (acepta incluso uno ya expirado, `ignoreExpiration`) y llama a `TokenBlacklistWriterService.revoke(jti, ttlSegundos)` de `@aureon/redis-client` para que deje de ser válido antes de su expiración natural, en vez de esperarla. `JwtAuthGuard` consulta `TokenBlacklistReaderService.isRevoked(jti)` después de validar firma/expiración localmente.

Patrón **blacklist** (no whitelist): la firma JWT sigue siendo la fuente de verdad primaria y se valida sin tocar Redis; Redis solo detecta revocaciones tempranas. Si Redis no responde, se degrada fail-open (se trata como no revocado, se loguea un warning) — Identity es el único servicio con permiso de escritura sobre `identity:token-blacklist:*`; el resto de microservicios AUREON (Customer/Scheduling/Workshop/Inventory/Assistant/Notification) solo importan `TokenBlacklistReaderService` para replicar el mismo guard. Ver `azure/aureon-redis-client` (paquete compartido, todavía sin publicar — se consume via dependencia `file:`, ver su README) y `REDIS_*` en `.env.example`.

## Seguridad

Bloqueo por intentos fallidos sobre `users.failed_login_attempts`/`locked_until` — **es un cambio de comportamiento real**: en el modelo anterior (single-tenant) esto era equivalente a "bloqueado en el único tenant"; ahora es **global al usuario**: si falla login repetidamente en el tenant A, queda bloqueado también para el tenant B. No hay forma de bloquear por tenant en este schema. Umbrales configurables (`AUTH_MAX_INTENTOS_FALLIDOS`, `AUTH_BLOQUEO_MINUTOS`), igual que antes.

## Estructura

```
src/modules/
  auth/            login/register/refresh/logout/me. Usuario ahora es global (email, first_name/last_name,
                   activo, eliminadoEn, intentos/bloqueo) — SIN rol propio (el rol vive en la membresia).
  rbac/            roles/permisos/membresias/permisos-directos por tenant + v_user_effective_permissions.
                   permisos-catalogo-legacy.ts: catalogo semilla (solo se usa una vez, al crear un tenant).
  tenants/         tenants + orquesta la creacion (siembra roles legacy, crea el primer admin).
  self-service-tokens/  reemplaza el modulo otp/ de la ronda anterior. user_tokens (EMAIL_VERIFICATION/
                   PASSWORD_RESET/MFA_SETUP), nada de OTP para clientes/asistente virtual.
common/
  domain/rol-negocio.ts     ya NO valida/lanza error — solo catalogo semilla + tipo para @Roles() legacy.
  guards/roles.guard.ts     legacy, compara contra JWT.roles (compatibilidad x-roles).
  guards/permissions.guard.ts  NUEVO — @RequirePermission('recurso:accion') contra v_user_effective_permissions.
  guards/platform-bootstrap.guard.ts  NUEVO — protege POST /tenants.
  validators/password-policy.ts  regex compartido (antes duplicado en 3 DTOs).
config/
  security.config.ts   userTokenExpiraMinutos (antes otpExpiraMinutos, renombrado).
  platform.config.ts    NUEVO — PLATFORM_BOOTSTRAP_KEY, PLATFORM_DEFAULT_ROLE_CODE (rol de auto-registro).
  redis.config.ts       NUEVO — host/port/password/db/keyPrefix ('identity') para @aureon/redis-client.
```

Módulos globales (`@Global()`, sin necesidad de `imports` explícito entre ellos): `CommonModule`, `SupabaseModule`, `RbacModule`, `TenantsModule`. Esto evita un ciclo de imports real: `AuthCommandService` necesita `RBAC_REPOSITORY`/`TENANT_REPOSITORY`, y `TenantCommandService` necesita `AUTH_REPOSITORY` — al ser global uno de los dos lados, ninguno de los dos `@Module` declara al otro en su `imports`.

## Fuera de alcance de esta migración (documentado, no implementado)

- **TOTP/MFA completo**: `mfa/iniciar-configuracion` solo emite/consume el token genérico de `user_tokens`; no hay generación de secret, QR, ni verificación de código rotativo.
- **Límite de intentos de verificación de OTP/tokens**: no hay columna de conteo en `user_tokens`; la única mitigación es expiración corta + un solo uso (igual limitación que ya existía para el módulo OTP anterior).
- **Actualizar `auth.yaml`** (contrato OpenAPI en `azure/aureon_api_contracts`) y el `CLAUDE.md` raíz del monorepo de contratos — el contrato sigue describiendo el modelo single-tenant anterior; no se tocó en esta ronda.
- **Nodo 20 vs 22** (`@supabase/supabase-js` requiere Node ≥22): sigue sin resolver, no relacionado a este cambio de esquema.
- **`POST /auth/register` público vs. admin-only**: se mantuvo público (crea usuario + membresía con rol por defecto configurable), sin revisitar esa decisión en esta ronda.
