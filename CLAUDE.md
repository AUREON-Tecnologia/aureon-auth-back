# CLAUDE.md

Guía de contexto para trabajar sobre **aureon-auth-back**. Reescrita tras la migración al esquema v3 (rama `feature/hu-13-migracion-multi-tenant-rbac`, partiendo de `feature/hu-01-12-auth-completo`) — **el modelo de datos cambió por completo**, no es una evolución del anterior.

## Idioma en el código — TODO en inglés (decisión 2026-08-15)

Identificadores (variables, funciones, clases, tipos, archivos) y comentarios de código van **siempre en inglés**, incluso cuando el término de negocio/dominio venga en español. Se traduce al escribir el código, no se deja mezclado. Este repo tiene mucho código preexistente en español (`RbacAdminService`, `crearRol`, etc.) que **no** se renombró retroactivamente — la regla aplica hacia adelante y a lo que se toque explícitamente. Fuera de esta regla (se queda en español, por convención deliberada): mensajes de error (`mensaje`, `codigo` de `common.yaml`), strings `nombre` de catálogos semilla (contenido de cara al usuario, no definiciones de código), y toda la documentación Markdown.

## Qué es este repo ahora

Microservicio NestJS de autenticación, **multi-tenant** con RBAC dinámico (roles y permisos por tenant, más permisos directos ALLOW/DENY por usuario). Repo independiente en Azure DevOps (`Proyecto-Aureon/AUREON/_git/aureon-auth-back`).

**El DDL autoritativo es `prisma/schema.prisma`** (`scripts-v3/scripts-auth.sql` y `prisma/init-auth-schema.sql` quedaron desactualizados: modelan `permissions` como una tabla por tenant, esquema que ya no aplica — ver correccion de alcance abajo). Tablas: `tenants`, `users` (global, sin campo de rol propio), `modules`/`tenant_modules` (catalogo global de modulos + activacion por tenant), `permissions` (catalogo **global**, unico `code` + FK obligatoria a `module_id`, sin `tenant_id`), `roles`/`role_permissions` (`roles` si es por tenant, `@@unique([tenantId, code])`), `user_tenant_memberships` (un rol por usuario por tenant), `user_permissions` (overrides ALLOW/DENY directos, por tenant), `user_sessions` (refresh token opaco), `user_tokens` (EMAIL_VERIFICATION/PASSWORD_RESET/MFA_SETUP). La vista SQL `v_user_effective_permissions` (definida en `prisma/init-auth-schema.sql`) esta marcada obsoleta en el propio archivo — `PrismaRbacRepository.permisosEfectivos()` calcula los permisos efectivos con Prisma nativo contra este esquema, no contra esa vista.

## Por qué el pivote (decisiones confirmadas con el usuario antes de migrar)

1. **Multi-tenant real**: varios negocios comparten este auth-service, no una única instalación de taller por deploy.
2. **Registro identifica el tenant vía un campo en el body** (`tenantCode`), no header ni subdominio. **Login ya no** (decisión 2026-08-15): solo `email`+`password`; el tenant se resuelve por las membresías activas del usuario (ver punto siguiente y la sección "Endpoints").
3. **El módulo OTP de cliente (HU_08/09 de la ronda anterior) se eliminó por completo** — `identity.token_verificacion` ya no existe; `user_tokens` tiene un propósito distinto (self-service del propio usuario interno: verificar su email, resetear su password, iniciar configuración de MFA), no OTP de WhatsApp para clientes/asistente virtual.
4. **Los 5 roles legacy (`administrador/tecnico/administrativo/cliente/sistema`) se siembran como `is_system=true` en cada tenant nuevo**, y el JWT sigue emitiendo el `code` real de la membresía en `roles` — para tenants que solo usan los roles sembrados, esto es compatible con el resto del ecosistema AUREON (`x-roles`). Un tenant puede crear roles propios vía el módulo `rbac`; en ese caso el JWT emite ese código real y el resto del ecosistema simplemente no lo reconocerá todavía (esperado, no es un error).
5. **`POST /tenants` se protege con un secreto compartido** (`PLATFORM_BOOTSTRAP_KEY`, header `X-Platform-Bootstrap-Key`) — el schema no modela un rol de "super-admin de plataforma" separado de los roles por tenant.

Detalle completo de estas decisiones y del análisis de brecha: `C:\Users\ginfa\.claude\plans\iterative-skipping-engelbart.md` (plan de la migración) — no versionado en git, referencia local de esta máquina.

## Endpoints

**`AuthController`** (`/auth`) — público salvo `/me`:
- `POST /auth/register` — requiere `tenantCode`; solo crea usuarios **globales nuevos** (si el email ya existe en cualquier tenant, `409`). Unirse a un tenant adicional con una cuenta existente no está expuesto vía auto-registro público en esta ronda (requeriría probar posesión de la cuenta primero).
- `POST /auth/login` (decisión 2026-08-22, reemplaza los diseños intermedios del 2026-08-15/08-22 — ver sección "Selección de tenant en login" más abajo) — **nunca abre sesión**: solo valida `email`+`password` y devuelve `tenants: TenantSummary[]` + `selectionToken` (ticket de corta vida). `POST /auth/switch-tenant` es quien realmente abre la sesión.
- `POST /auth/switch-tenant` — única operación que abre sesión (JWT + refresh + las 3 cookies). Dos modos: con el `selectionToken` de `login` (recién logueado, sin sesión previa) o ya autenticado (cambio de tenant tipo AWS). Ver sección de abajo.
- `POST /auth/refresh`, `POST /auth/logout` — igual que antes (refresh token opaco con rotación); `logout` además borra en Redis la sesión del access token vigente si viene en `Authorization` (ver "Whitelist de sesiones del access JWT" más abajo).
- `GET /auth/me` (JWT) — usa `tenantId`/`roles[0]` del propio JWT, no relee la membresía.

## Selección de tenant en login (decisión 2026-08-22, implementado)

**Por qué existe:** front necesita que un usuario con varios tenants activos pueda elegir con cuál trabajar, porque roles/permisos/`activeModules` son por membresía — no hay un "permiso global" del usuario, cambian según el tenant. Hasta ahora esto no era un problema real porque, en la práctica, ningún usuario tenía más de una membresía activa; eso ya cambió del lado de negocio.

**Diseño final (dos operaciones separadas, iteración sobre un diseño intermedio que reutilizaba `login` con `tenantCode` opcional):**

- `POST /auth/login` — `AuthCommandService.login(email, password, context?)` valida credenciales exactamente igual que siempre (intentos fallidos, bloqueo, etc.) y **nunca** llama a `emitirSesion()`. Al final: `listarMembresiasActivasDeUsuario` → si 0, `401 InvalidCredentials` (sin cambio); si ≥1 (sin distinguir 1 vs. N — esto simplificó bastante el método respecto al diseño intermedio), emite un `selectionToken` de un solo uso vía `issueSelectionTicket()` y responde `LoginTenantsResult { tenants, selectionToken }`. `AuthController.login()` además setea `selectionToken` como cookie `tenant_selection_token` (`CookieService.setTenantSelectionCookie`, httpOnly, `Path=/auth/switch-tenant`, 5 min) — dual body+cookie, mismo patrón que el resto de tokens de sesión. El frontend siempre da un segundo paso, incluso con un solo tenant (auto-elegirlo sin mostrar UI es decisión de front, no un atajo de backend).
- `POST /auth/switch-tenant` — `AuthCommandService.switchTenant(existingAccessToken?, tenantCode, selectionToken?, context?)` es la **única** operación que llama a `emitirSesion()`. Resuelve quién pide el cambio (`resolveSwitchIdentity()`, privado) en este orden:
  1. **Modo sesión**: si llega `existingAccessToken` (header o cookie `access_token`) y verifica (firma/expiración local + `AccessTokenSessionReaderService.getSession(jti)` contra la whitelist de Redis, igual que `JwtAuthGuard`) → usuario ya autenticado, cambiando de tenant sin volver a loguearse (igual que cambiar de cuenta/región en AWS). Un `RedisUnavailableError` de esa consulta **se propaga** (fail-closed, no se confunde con "no hay sesión").
  2. **Modo ticket**: si lo anterior no resuelve (sin token, inválido o expirado), cae al `selectionToken` (`consumeSelectionTicket()`) — leído primero de la cookie `tenant_selection_token`, si no del body.
  3. Si ninguno resuelve, `401 InvalidCredentials`.
  Luego, igual en ambos modos: `tenantRepository.findByCode` (`404 TenantNotFound` si no existe/inactivo) + `IRbacRepository.buscarMembresia(user.id, tenant.id)` (`401 InvalidCredentials` genérico si no existe o está inactiva — **nunca** un error distinto que revele "el tenant existe pero no eres miembro"). Si venía de modo sesión, la sesión del tenant que se abandona se invalida **de inmediato** (no se deja expirar sola): `sessionRepository.invalidateAllForUserInTenant(user.id, tenantIdViejo)` + `deleteAccessTokenSessionIfPresent(existingAccessToken)` (mismo helper que ya usa `logout()` para borrar el `jti` de Redis).

**Ticket de selección — Redis, no Postgres** (`RedisService` genérico de `@aureon/redis-client`, ya registrado globalmente en este repo vía `CommonModule`): dos keys, `tenant-selection:token:<token>` → `{userId}` y `tenant-selection:user:<userId>` → `<token>` (para poder borrar el ticket anterior de un usuario al emitir uno nuevo — evita tickets colgados si alguien repite `login` antes de completar la selección). TTL 5 minutos (`TENANT_SELECTION_TTL_SECONDS`, `common/services/cookie.service.ts` — la misma constante fija el TTL de Redis y el `Max-Age` de la cookie, para que no queden desincronizados). De un solo uso: se borran ambas keys en el primer `consumeSelectionTicket()`, sin importar si el `tenantCode` elegido termina siendo válido o no — evita que un ticket robado permita probar varios `tenantCode` seguidos.

**Por qué NO por header:** `permissions`/`activeModules` se calculan una sola vez y se queman dentro del JWT (`emitirSesion()`) — todo el ecosistema (`RolesGuard`/`PermissionsGuard` de `@aureon/redis-client`, usados también por `workshop-clients-back`) los lee de ahí sin ir a BD por request (ver `@aureon/redis-client/CLAUDE.md`, sección "PermissionsGuard"). Un tenant por header implicaría o (a) recalcular permisos por request en cada microservicio consumidor —contradice el diseño stateless ya decidido— o (b) firmar los permisos de **todos** los tenants del usuario en un solo JWT y dejar que cada request "elija" cuál mirar, lo que infla el token y expone de más. `switchTenant` emitiendo un JWT completo nuevo, scoped a un solo tenant, no requiere tocar ningún otro microservicio del ecosistema — el cambio queda 100% contenido en Identity.

**CSRF — `@SkipCsrf()` en ambos endpoints, trade-off aceptado y documentado:** el modo ticket de `switch-tenant` es, en esencia, "abrir una sesión nueva desde cero" (igual que `login`/`register`), así que una cookie `csrf_token` vieja de una sesión anterior no debe poder bloquearlo (mismo hallazgo 2026-08-16 de la sección "Autenticación por cookie" más abajo). Esto también exime de CSRF al modo sesión (ya autenticado, cambiando de tenant) — se evaluó partir esto en dos endpoints (uno exento, uno no) para no debilitar esa protección, y se descartó para mantener una sola operación de cara al frontend en ambos modos.

**Contrato (`auth.yaml`):** `LoginRequest` ya no tiene `tenantCode`. `POST /auth/login` responde siempre `LoginTenantsResponse` (`{ tenants, selectionToken }`, ambos `required`) — ya no hay `oneOf` ni el schema `TenantSelectionRequired` (se eliminó). `POST /auth/switch-tenant` es nuevo: `security: [{bearerAuth:[]}, {cookieAuth:[]}, {}]` (autenticación opcional a nivel de spec), `requestBody` `SwitchTenantRequest` (`tenantCode` requerido, `selectionToken` opcional), responde `200 LoginResponse` (sin tocar ese schema).

**Eventos de auditoría:** `LOGIN_TICKET_EMITIDO` (cada `login`, reemplaza al viejo `LOGIN_SELECCION_TENANT_REQUERIDA` que solo disparaba en el caso ambiguo) y `TENANT_CAMBIADO` (nuevo, solo en modo sesión de `switchTenant`, antes de invalidar la sesión vieja). `LOGIN_EXITOSO` ahora solo se registra cuando `emitirSesion()` realmente corre (dentro de `switchTenant`), nunca dentro de `login`.

**Fuera de alcance de esta ronda:** recordar el último tenant elegido entre sesiones (front decide si lo persiste, por ejemplo en `localStorage`, para pre-seleccionarlo); invalidación inmediata de sesión al **desactivar una membresía** desde `/rbac/membresias` (hoy esa acción no toca Redis ni `user_sessions` — el usuario expulsado sigue operando en ese tenant hasta que su access token expire naturalmente, ≤30 min; señalado como gap real, no arreglado en esta ronda).

**`PasswordResetController`** (`/auth/password`, público): `POST /olvide`, `POST /restablecer` — reset invalida todas las sesiones del usuario al completarse.

**`SelfServiceController`** (`/auth`): `POST /email/verificar` (público), `POST /email/reenviar-verificacion` (JWT), `POST /mfa/iniciar-configuracion` (JWT, **solo el plumbing del token de un solo uso — no hay TOTP real implementado**, ver "Fuera de alcance").

**`TenantsController`** (`/tenants`, protegido por `PlatformBootstrapGuard`): `POST /` (crea tenant + siembra roles legacy + primer admin), `GET /`, `GET /:id`.

**`RolesController`/`PermisosController`/`MembresiasController`** (`/rbac/...`, `JwtAuthGuard`+`RolesGuard`+`PermissionsGuard`, `@Roles('administrador')` **y** `@RequirePermission('<codigo>')` por ruta — ambos deben pasar, ver "Permisos granulares en /rbac/*" abajo. Scoped siempre al `tenantId` del JWT, nunca a un parámetro de la URL):
- `GET/POST /rbac/roles` (`roles:list`/`roles:create`), `POST /rbac/roles/:id/permisos` (`roles:assign-permission`)
- `GET/POST /rbac/permisos` (`permissions:list`/`permissions:create`), `POST/DELETE /rbac/permisos/usuarios/:userId[/:permisoId]` (`permissions:assign-direct`/`permissions:revoke-direct`, ALLOW/DENY directo)
- `GET/GET:id/PATCH/DELETE /rbac/membresias` (`memberships:list`/`memberships:read`/`memberships:update`/`memberships:deactivate`) — reemplaza el CRUD de "usuarios" de la ronda anterior; `DELETE` desactiva la **membresía a ese tenant**, nunca el usuario global (podría pertenecer a otros tenants).

`ModulosController` (`/modulos`, `/rbac/modulos-tenant`) se dejó deliberadamente **fuera** de `@RequirePermission` por ahora — sigue solo con `@Roles('administrador')` (y `PlatformBootstrapGuard` en `POST /modulos`). Alcance sin decidir, ver `ANALISIS-matriz-permisos-auth.md` en el repo de contratos.

## Permisos granulares en /rbac/* (activado)

`@RequirePermission` complementa a `@Roles('administrador')` (AND, no reemplazo) en los 11 endpoints de arriba — se eligió así para no cambiar quién tiene acceso hoy: el seed (`permisos-catalogo-legacy.ts`, módulo `rbac-core`, 11 permisos) le otorga esos mismos 11 códigos al rol `administrador` en cada tenant nuevo, así que en la práctica `@Roles('administrador')` ya implica los 11 `@RequirePermission`. La ganancia real es dejar la puerta abierta a que un tenant le dé acceso granular a otro rol sin tocar código, vía `POST /rbac/roles/:id/permisos`.

**Backfill pendiente para tenants ya existentes**: `sembrarRolesLegacy` solo corre una vez, al crear el tenant (`POST /tenants`). Un tenant creado *antes* de que este módulo `rbac-core` existiera en el seed no tiene esos 11 permisos otorgados a su rol `administrador` — sus administradores perderían acceso a `/rbac/*` hasta correr un backfill (activar el módulo `rbac-core` + otorgar sus permisos al rol `administrador` de cada tenant existente). No aplica si todavía no hay tenants reales en la base.

**Códigos de `clients`/`users` traducidos a inglés (2026-08-15) — requiere migración manual en producción**: `permisos-catalogo-legacy.ts` sembraba estos dos módulos en español (`clientes`/`usuarios`, con permisos `clientes:listar`/`clientes:crear`/`clientes:editar`/`clientes:eliminar` y `usuarios:listar`/`usuarios:crear`/`usuarios:editar`/`usuarios:desactivar`) — inconsistente con `rbac-core`, que ya nació en inglés. Se tradujeron a `clients`/`users` (`clients:list/create/update/delete`, `users:list/create/update/deactivate`), junto con los `@RequirePermission(...)` de `ClientesController` en `workshop-clients-back`. `RbacSeedService.asegurarCatalogoGlobal()` es *find-or-create por `code`*, no una migración — corre en cada `POST /tenants`, así que este cambio de código por sí solo **no** actualiza los `Module`/`Permission` ya sembrados para tenants creados antes de esta fecha (p. ej. `aureon-1`, la cuenta de prueba real): sus `role_permissions` seguirían apuntando a las filas en español, ahora huérfanas de los guards actualizados. `scripts/2026-08-15-rename-permission-codes-en.sql` (nuevo) hace el `UPDATE ... SET code = ...` idempotente que preserva los `id` existentes (por eso no rompe `role_permissions`/`user_permissions`) — hay que correrlo a mano contra la base de Railway (no hay acceso a esas credenciales desde este entorno); hasta entonces, tenants pre-existentes seguirán viendo los códigos viejos en `activeModules`/`permissions` del JWT.

## Wire alineado con auth.yaml (inglés) — ya no es deuda pendiente

Los DTOs de presentación de `/auth/register|login|refresh|logout|me` ahora emiten exactamente los nombres de campo en inglés que documenta `auth.yaml` — la nota de `info.description` de ese contrato sobre campos servidos en español (`correo`, `nombre`, `rol`, `tipoToken`, `expiraEn`, `usuario`, `permisos`, `primerNombre`, `apellido`, `mensaje`, `bloqueadoHasta`, `codigo: "CUENTA_BLOQUEADA"`) ya no aplica a este servicio y debería borrarse de `auth.yaml` en su próxima edición. Mapeo aplicado:

- `AuthenticatedUserDto` (antes `UsuarioAutenticadoDto`, `authenticated-user.dto.ts`): `email`/`name`/`role`/`active` (antes `correo`/`nombre`/`rol`/`activo`).
- `LoginResponseDto`: `tokenType`/`expiresAt`/`refreshExpiresAt`/`user`/`permissions` (antes `tipoToken`/`expiraEn`/`refreshExpiraEn`/`usuario`/`permisos`).
- `RegisterDto`: `firstName`/`lastName` (antes `primerNombre`/`apellido`) — la capa de aplicación (`RegisterInput`, `Usuario` entity) sigue usando `primerNombre`/`apellido` internamente; el mapeo ocurre en `AuthController.register()`.
- Logout: `{ message }` (antes `{ mensaje }`).
- `CuentaBloqueadaException` (423): `codigo: 'LOCKED_ACCOUNT'` (antes `'CUENTA_BLOQUEADA'`) y campo `lockedUntil` (antes `bloqueadoHasta`).
- `codigo`/`mensaje`/`detalles` del envelope de `Error` (`GlobalExceptionFilter`) mantienen esos **nombres** de campo en español porque vienen de `common.yaml`, compartido con módulos que aún no se tradujeron (rbac, tenants, self-service-tokens) — pero desde 2026-08-15 su **contenido**, dentro de todo lo alcanzable por `/auth/*`, está en inglés (decisión: nada expuesto por `/auth/*` queda en español). Esto incluyó traducir: los `mensaje` de `AuthCommandService`/`AuthQueryService` (credenciales inválidas, tenant/usuario no encontrado, cuenta bloqueada, sesión cerrada, etc.), los 2 fallback genéricos de `GlobalExceptionFilter` (500 y validación fallida — estos aplican a todo el repo, no solo a `/auth/*`, efecto secundario aceptado), el mensaje de política de password en `RegisterDto` (nueva constante `PASSWORD_POLICY_MESSAGE_EN` en `password-policy.ts`, sin tocar la versión en español que siguen usando `CrearTenantDto`/`RestablecerPasswordDto`), y los `mensaje` de `JwtAuthGuard`/`CsrfGuard` en `@aureon/redis-client` (>=0.6.1) — ver el `CLAUDE.md` de ese paquete para el efecto secundario en `workshop-clients-back`. Los guards específicos de RBAC (`RolesGuard`/`PermissionsGuard`, tanto el compartido como el local de este repo) y `PlatformBootstrapGuard` **no** se tocaron — solo los alcanzan endpoints de `rbac.yaml`, todavía en español.
- Mismo criterio aplicado a los **tipos internos** de `AuthCommandService`/`TokenService` (no solo lo serializado): `ContextoSesion`→`SessionContext`, `AuthSessionResult` (`usuario`→`user`, `rolCodigo`→`roleCode`, `permisos`→`permissions`, `accessTokenExpiraEn`→`accessTokenExpiresAt`, `refreshExpiraEn`→`refreshExpiresAt`), `AccessTokenGenerado`→`AccessTokenGenerated`, `OpaqueTokenGenerado`→`OpaqueTokenGenerated`, `decodeParaCierreSesion`→`decodeForLogout`. No se tocó `Usuario` (la entidad de dominio) ni los métodos de `IAuthRepository`/`ISessionRepository`/`IRbacRepository` (`registrarIntentoFallido`, `buscarMembresia`, etc.) — cascadearían a los otros módulos, fuera de alcance de esta ronda.

## Modelo de tokens

Access JWT corto (`JWT_EXPIRES_IN`, default `30m`) + refresh token opaco de vida larga (`JWT_REFRESH_EXPIRES_IN_DIAS`, default `30`, hash en `user_sessions.refresh_token_hash`, rotación en cada uso). `sub` del JWT es `users.id`; el payload también lleva `tenantId` (obligatorio, define contra qué tenant se resuelve todo lo demás en cada request). El refresh token no se tocó en el pivote de abajo — sigue viviendo solo en Postgres.

**`permissions` en el JWT (desde `@aureon/redis-client` >=0.5.0):** `AuthCommandService.emitirSesion()` calcula `permisosEfectivos(user.id, tenantId)` **antes** de firmar el access token (ya no solo después, para el body de `LoginResponse`) y lo incluye como claim `permissions: string[]` en el propio JWT. Esto es lo que le permite a otros microservicios del ecosistema (que no tienen acceso directo a las tablas RBAC de Identity) hacer chequeos de permiso fino localmente, vía el `PermissionsGuard`/`@RequirePermission()` compartido — sin llamada de red a este repo por request. Ver `@aureon/redis-client/CLAUDE.md`, sección "PermissionsGuard / @RequirePermission()", para el diseño completo y el trade-off de staleness aceptado (un permiso otorgado/revocado solo se refleja en el próximo login/refresh del usuario, igual que ya pasaba con `roles`).

Nota: las rutas propias `/rbac/*` de este repo (§ "Permisos granulares en /rbac/*" abajo) siguen usando su **propio** `PermissionsGuard` local (`common/guards/permissions.guard.ts`), que sí consulta la base en vivo vía `IRbacRepository.tienePermisoEfectivo` — deliberado, no un descuido: son exactamente los endpoints donde se crean/revocan permisos, así que ahí interesa una lectura fresca en vez de la del JWT (que puede tener hasta `JWT_EXPIRES_IN` de retraso). El guard compartido basado en el claim del JWT es para el resto del ecosistema, no para este repo.

**`permissions` en el body vs. en el JWT — dos formas distintas (decisión 2026-08-22):** el claim del JWT sigue siendo el array plano de siempre (`string[]` de códigos `recurso:accion`, sin tocar — es lo único que leen `PermissionsGuard`/`@RequirePermission()`). Pero `LoginResponseDto.permissions` (el body de `register`/`switchTenant`/`refresh`) ahora es un objeto anidado `{ MODULO: { RECURSO: [ACCION, ...] } }`, pensado para que el front arme menús por módulo sin parsear códigos. Se calcula aparte, en `emitirSesion()`, vía `groupPermissionsByModule()` (`common/utils/group-permissions.util.ts`) + el nuevo `IRbacRepository.getModuleCodesByPermission()` (código de permiso → código de módulo dueño, catálogo global completo, una sola query). MODULE = `Module.code` en mayúscula; RESOURCE = la parte antes de `:` del código, en mayúscula; ACTION = la parte después de `:`, en mayúscula tal cual viene de BD — **sin tabla de traducción** (`list` no se convierte a `VIEW`, `update` no se convierte a `EDIT`; si el front necesita ese vocabulario, es una traducción que le corresponde a él, no a este repo).

**`activeModules` en el JWT (desde `@aureon/redis-client` >=0.7.0):** además de `permissions`, el JWT (y el body de `LoginResponse`) llevan `activeModules: string[]` — los códigos de los módulos activos (`tenant_modules.is_active`) para el tenant del usuario. Antes de esto, un usuario no-administrador no tenía forma de saber qué módulos estaban licenciados para su tenant (`GET /rbac/modulos-tenant` requiere `@Roles('administrador')`); ahora viaja directo en la sesión. `IRbacRepository.listActiveModulesForTenant(tenantId)` (nuevo) es quien lo calcula.

**Fix relacionado, mismo cambio:** `permisosEfectivos()` (`PrismaRbacRepository`) ahora también filtra por módulo activo — antes un permiso seguía siendo efectivo aunque su módulo dueño estuviera desactivado para el tenant (`tenant_modules.is_active = false`), porque nada lo verificaba (era la decisión pendiente §9.4 de `ANALISIS-matriz-permisos-auth.md`). Tanto los permisos vía rol como los overrides directos ALLOW ahora exigen `module.tenantModules.some({ tenantId, isActive: true })`.

## Autenticación por cookie (desde `@aureon/redis-client` >=0.6.0)

El frontend dejó de poder guardar el JWT en JS (localStorage). Diseño asumido: `aureon-auth-back`,
`workshop-clients-back`, el futuro monolito `taller`, y el frontend viven bajo subdominios de un
mismo dominio raíz (ej. `auth.aureon.app`, `clientes.aureon.app`, `app.aureon.app`) — **no** en
dominios Railway sueltos sin relación entre sí (los dominios Railway actuales son transitorios).
Bajo un dominio compartido, `Domain=$COOKIE_DOMAIN` hace que la cookie que pone este repo sea
visible en los otros subdominios sin ningún componente intermediario (BFF/gateway) — cada servicio
la valida de forma independiente, igual que ya validan el JWT hoy (secreto compartido). El dominio
es 100% configurable (`COOKIE_DOMAIN`, vacío hoy = cookie host-only).

Este repo es el **único emisor** de las 3 cookies de sesión (`CookieService`,
`src/common/services/cookie.service.ts`): `access_token`/`refresh_token`/`csrf_token`
(nombres definidos en `@aureon/redis-client` — `ACCESS_TOKEN_COOKIE_NAME` etc. — fuente de verdad
compartida). `AuthController.register/login/refresh` las setean via `res.cookie(...)` (además del
body de respuesta, que **no cambió** — sigue devolviendo `token`/`refreshToken` para consumidores
no-browser); `logout` las limpia. `workshop-clients-back`/`taller` no emiten cookies, solo las leen
(vía el fallback de `JwtAuthGuard` a la cookie `access_token`, ver `@aureon/redis-client/CLAUDE.md`).

**Atributos:** `access_token` — httpOnly, `Domain=$COOKIE_DOMAIN`, `Path=/`, vive lo que dure el
access token. `refresh_token` — httpOnly, **sin** `Domain` (host-only: solo este repo lo necesita),
`Path=/auth` (acotado a `/auth/refresh` y `/auth/logout`, no viaja en cada request). `csrf_token` —
**no** httpOnly (el frontend debe poder leerla), `Domain=$COOKIE_DOMAIN`, `Path=/`.

**`refresh`/`logout` — modo dual (cookie o body):** `AuthController` lee `refresh_token` de la
cookie primero; si no está, cae al body (`RefreshDto`/`LogoutDto`.`refreshToken`, ahora opcional) —
así Postman/scripts siguen funcionando sin tocar nada. Si ninguna de las dos fuentes trae el valor,
`400 BAD_REQUEST`. `logout` resuelve el access token igual: header `Authorization` primero, cookie
`access_token` como fallback (para poder borrar la sesión de Redis por `jti` sin que el navegador
tenga que exponer el JWT a JS).

**CSRF:** mover de header a cookie le quita al sistema la inmunidad a CSRF que tenía gratis con
`Authorization: Bearer` (un sitio de terceros no puede setear ese header en una request cross-site,
pero el navegador sí manda cookies automáticamente). `CsrfGuard` (compartido, `@aureon/redis-client`,
registrado como `APP_GUARD` global en `AppModule`) exige que el header `X-CSRF-Token` coincida con
la cookie `csrf_token` en cualquier request no-`GET` — solo si esa cookie está presente (double-submit
cookie; no rompe clientes autenticados por header).

`POST /auth/login` y `POST /auth/register` llevan `@SkipCsrf()` (`@aureon/redis-client` >=0.8.0) —
**hallazgo 2026-08-16**: como `CsrfGuard` es el único `APP_GUARD` global de este repo, se activaba en
*cualquier* request no-`GET` que trajera una cookie `csrf_token`, sin importar si el endpoint era
público. La `csrf_token` no es `httpOnly` y vive ~30 min (mismo TTL que el access token) — un cliente
(Postman con su cookie jar, o un navegador real si el usuario cerró la pestaña sin hacer logout) podía
traer una `csrf_token` vieja de una sesión anterior en un login/register nuevo y sin sesión, y el guard
la rechazaba con `403 CSRF_TOKEN_INVALID` aunque el login fuera perfectamente válido — el estado de
cookies de una sesión previa no tiene por qué poder bloquear la apertura de una sesión nueva.
`refresh`/`logout` no llevan `@SkipCsrf()`: ahí sí corresponde exigir CSRF, porque solo son
alcanzables cuando ya existe una sesión.

**`CORS_ALLOW_ALL_ORIGINS`** (nuevo, 2026-08-17): si es `"true"`, `main.ts` llama a `enableCors`
con `origin: true` (refleja el `Origin` de cada request) en vez de `cookie.frontendOrigin` — pensado
para dev, para no tener que hacer coincidir el origin exacto del cliente. El default (`app.config.ts`,
`corsAllowAllOrigins`) **depende de `NODE_ENV`**, no es `true` a secas: abierto cuando `NODE_ENV !==
'production'`, cerrado cuando `NODE_ENV === 'production'` — así un deploy que nunca llegue a tener
esta variable seteada en Railway queda cerrado por default apenas ese entorno tenga `NODE_ENV=production`
de verdad. Deliberado: el deploy actual (`aureon-auth-back-production.up.railway.app`) tiene
`NODE_ENV=development` hoy (todavía no existe el cluster productivo real), así que **también queda
con CORS abierto a cualquier origen** bajo este esquema — aceptado explícitamente por el usuario
(pre-lanzamiento, sin usuarios finales reales todavía). Revisar esto antes de que haya usuarios reales
en ese entorno: o se setea `NODE_ENV=production` ahí, o se fuerza `CORS_ALLOW_ALL_ORIGINS=false`
explícitamente.

**Prerequisitos nuevos:** `cookie-parser` corriendo antes de los guards (`app.use(cookieParser())`
en `main.ts`) y CORS con `credentials: true` + origin explícito (`FRONTEND_ORIGIN`, no wildcard —
incompatible con `credentials: true`). Este repo **no tenía CORS configurado en absoluto** antes de
este cambio.

### Whitelist de sesiones del access JWT (Redis) — `@aureon/redis-client` (>=0.3.0)

El access JWT lleva `jti` (uuid). En `AuthCommandService.emitirSesion` (login/register/refresh), tras firmar el JWT se llama a `AccessTokenSessionWriterService.saveSession(jti, payload, ttlSegundos)` — guarda el payload en Redis con TTL = la expiración del token. `POST /auth/logout` sigue sin requerir `Authorization` (el `refreshToken` sigue siendo la única credencial obligatoria, ver historia HU-AUTH-02 en `BACKLOG_FUNCIONAL.md`) — pero si el cliente manda el access token vigente en el header, se decodifica (acepta incluso uno ya expirado, `ignoreExpiration`, ver `TokenService.decodeParaCierreSesion`) solo para extraer el `jti` y borrar la key con `deleteSession` (invalidación inmediata, no hay que esperar el TTL). `JwtAuthGuard` valida firma/expiración localmente y después llama `AccessTokenSessionReaderService.getSession(jti)`.

Patrón **whitelist**, no blacklist: Redis es la fuente de verdad de si la sesión sigue vigente, no solo un detector de revocación anticipada. **Fail-closed**: si Redis no responde, `saveSession`/`getSession` lanzan `RedisUnavailableError` (`@aureon/redis-client`) y el llamador responde `503` (`codigo: 'AUTH_BACKEND_UNAVAILABLE'`) — login/register/refresh no devuelven `200` con un token que nadie podría validar después, y ningún endpoint protegido por `JwtAuthGuard` deja pasar un token si no puede confirmar la sesión. Esto es un cambio deliberado respecto al patrón anterior (blacklist + fail-open): Redis ahora es parte del camino crítico de autenticación de todo el ecosistema. Ver `azure/aureon-redis-client/CLAUDE.md` (por qué se reabrió la decisión, el trade-off aceptado) y `REDIS_*` en `.env.example`.

Identity es el único servicio con permiso de escritura sobre `identity:access-token:*`; el resto de microservicios AUREON (Customer/Scheduling/Workshop/Inventory/Assistant/Notification) solo deben importar `AccessTokenSessionReaderService`. **`workshop-clients-back` todavía no migró** (sigue en blacklist v0.2.x sobre su propio stub, fail-open) — no hay regresión porque nunca dependió de que Identity escribiera revocaciones, pero tampoco se beneficia de la invalidación inmediata hasta que se actualice en una ronda futura.

**Requisito para el front en el botón "cerrar sesión":** el header `Authorization: Bearer <accessToken>` en `POST /auth/logout` es opcional a nivel de contrato (`refreshToken` sigue siendo la única credencial obligatoria), pero es la **única** forma de que la sesión de Redis se borre de inmediato. Si el front llama a logout mandando solo `{ refreshToken }` sin ese header, el cierre de sesión en Postgres funciona igual, pero el access token queda válido en Redis hasta su TTL natural (≤ `JWT_EXPIRES_IN`, default 30 min) — Postgres y Redis quedan inconsistentes por esa ventana. Decisión confirmada con el usuario: no se agrega un mecanismo de backend para hacerlo determinista (eso requeriría persistir el `jti` del access token junto a la fila de `user_sessions`); en cambio, el front debe garantizar que siempre mande ese header cuando hay un usuario logueado haciendo logout desde la propia UI.

**Distribución del paquete:** ya no depende de `file:../aureon-redis-client` (carpeta hermana que rompía builds aislados en Railway/CI). Se vendoriza un tarball compilado dentro de este mismo repo — `package.json` apunta a `file:vendor/aureon-redis-client-0.4.0.tgz`. Ver `vendor/README.md` para cómo actualizarlo cuando cambie la librería (aún no se decidió un registro real tipo Azure Artifacts).

**Desde v0.4.0** el paquete también exporta `RolesGuard`/`@Roles()` (autorización por `x-roles`, antes duplicada a mano en `common/guards/roles.guard.ts` de este repo — esa copia local se borró, ahora se importa directo de `@aureon/redis-client`).

## Seguridad

Bloqueo por intentos fallidos sobre `users.failed_login_attempts`/`locked_until` — **es un cambio de comportamiento real**: en el modelo anterior (single-tenant) esto era equivalente a "bloqueado en el único tenant"; ahora es **global al usuario**: si falla login repetidamente en el tenant A, queda bloqueado también para el tenant B. No hay forma de bloquear por tenant en este schema. Umbrales configurables (`AUTH_MAX_INTENTOS_FALLIDOS`, `AUTH_BLOQUEO_MINUTOS`), igual que antes.

## Estructura

```
src/modules/
  auth/            login/register/refresh/logout/me. Usuario ahora es global (email, first_name/last_name,
                   activo, eliminadoEn, intentos/bloqueo) — SIN rol propio (el rol vive en la membresia).
  rbac/            roles/permisos/membresias/permisos-directos; permisos efectivos via Prisma nativo
                   (PrismaRbacRepository.permisosEfectivos), no via SQL crudo. permisos-catalogo-legacy.ts:
                   catalogo semilla (solo se usa una vez, al crear un tenant).
  tenants/         tenants + orquesta la creacion (siembra roles legacy, crea el primer admin).
  self-service-tokens/  reemplaza el modulo otp/ de la ronda anterior. user_tokens (EMAIL_VERIFICATION/
                   PASSWORD_RESET/MFA_SETUP), nada de OTP para clientes/asistente virtual.
common/
  domain/rol-negocio.ts     ya NO valida/lanza error — solo catalogo semilla + tipo para @Roles() legacy.
  guards/permissions.guard.ts  @RequirePermission('recurso:accion'); ver "Calculo de permisos efectivos" abajo.
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
- **Nodo 20 vs 22** (`@supabase/supabase-js` requiere Node ≥22): sigue sin resolver, no relacionado a este cambio de esquema.
- **`POST /auth/register` público vs. admin-only**: se mantuvo público (crea usuario + membresía con rol por defecto configurable), sin revisitar esa decisión en esta ronda.
