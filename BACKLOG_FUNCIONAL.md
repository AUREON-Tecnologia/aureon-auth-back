# Backlog funcional — aureon-auth-back

> **Estado:** las 12 HU de este documento (HU-AUTH-01 a HU-AUTH-14, con HU-AUTH-11 fusionada en HU-AUTH-06 y HU-AUTH-12 ya conforme sin cambios) fueron implementadas en la rama `feature/hu-01-12-auth-completo`, con tests unitarios en verde. Ver `CLAUDE.md` de este repo para el detalle de las decisiones tomadas durante la implementación (valores de expiración elegidos, resolución del modelo de roles, eliminación del `ResponseInterceptor`, etc.) y la lista de pendientes reales que quedaron fuera de alcance.

Análisis de brecha entre lo que `aureon-auth-back` implementa hoy y lo que la idea de producto AUREON (ERS + `docus/CONTEXTO_PROYECTO.md`, 68 RF / 24 RNF) exige de un módulo de identidad/autenticación. El ERS **no dedica un módulo de RF propio a autenticación** — solo aparece como soporte transversal de RNF-004 a RNF-008, más las responsabilidades de gestión de usuarios/roles del rol `administrador` (§5) y las obligaciones legales de datos personales (RNF-019–024). Esas fuentes son la base de las historias de usuario siguientes.

Convenciones: cada HU tiene **Contexto** (por qué existe, qué RF/RNF la sustenta), **Criterios de aceptación** y **Estado actual** (qué hay hoy en el código, ver `CLAUDE.md` del repo para el detalle técnico). Prioridad heredada de la RNF/regla que la origina cuando aplica.

---

## Tema 1 — Sesión: renovación y cierre reales (RNF-008)

El contrato (`auth.yaml`) y RNF-008 asumen un modelo de sesión con expiración controlada y revocación; hoy el servicio es JWT puro sin estado, sin logout y sin verdadero refresh.

### HU-AUTH-01 — Refresh token con rotación
**Como** usuario autenticado (cualquier rol interno), **quiero** poder renovar mi sesión con un refresh token de vida larga **para** no tener que volver a autenticarme con credenciales cada vez que expira mi token de acceso, sin mantener una sesión indefinidamente válida.

**Contexto:** `auth.yaml` define `POST /auth/refresh` recibiendo un `refreshToken` opaco (no el JWT de acceso) y rotándolo (el usado queda invalidado). Hoy `refresh()` en `auth-command.service.ts` verifica el mismo access token y reemite uno igual — si el access token ya expiró, no hay forma de renovar sesión sin volver a hacer login.

**Criterios de aceptación:**
- `POST /auth/refresh` recibe un `refreshToken` opaco (no el JWT), no el `accessToken`.
- El `refreshToken` se persiste (tabla `identity.sesion_usuario`) asociado al usuario, con fecha de emisión/expiración.
- Al usarse exitosamente, el `refreshToken` anterior queda invalidado (`activa=false`) y se emite uno nuevo (rotación).
- Reenviar un `refreshToken` ya usado o revocado responde `401` (detección de reuso).
- Un `refreshToken` expirado responde `401`, no 500.

**Estado actual:** No implementado — no existe tabla de sesión en uso, `/auth/refresh` opera solo sobre el JWT de acceso.

### HU-AUTH-02 — Cierre de sesión (logout)
**Como** usuario autenticado, **quiero** cerrar sesión explícitamente **para** que mi refresh token deje de ser válido si mi dispositivo se pierde o comparto una sesión.

**Criterios de aceptación:**
- Existe `POST /auth/logout` recibiendo el `refreshToken` a revocar (según `auth.yaml`).
- Revocar un `refreshToken` ya revocado también responde `200` (idempotente).
- El JWT de acceso ya emitido no se revoca por este endpoint (es stateless) — solo dejará de poder renovarse.
- El endpoint no requiere header `Authorization` (el propio `refreshToken` es la credencial), consistente con `x-roles: [publico]`.

**Estado actual:** No implementado — no existe el endpoint ni la tabla de sesiones que lo soportaría.

### HU-AUTH-03 — Expiración de sesión configurable
**Como** administrador del sistema, **quiero** que el tiempo de vida del access token y del refresh token sean valores explícitos y documentados **para** cumplir RNF-008 ("expiración de sesión en X minutos", valor hoy sin definir en el ERS).

**Criterios de aceptación:**
- Se define y documenta un valor concreto de expiración de access token (ej. 15–60 min) y de refresh token (ej. 7–30 días) — decisión de equipo, no viene dada por el ERS.
- Ambos valores son configurables por variable de entorno (ya existe `JWT_EXPIRES_IN` para el access token; falta el equivalente para refresh token).
- Se documenta la decisión en el `CLAUDE.md` del repo para que quede trazada (el ERS deja explícitamente esto "pendiente de definir por el equipo").

**Estado actual:** Solo existe `JWT_EXPIRES_IN` (default 7 días) para un único token; no hay separación access/refresh.

---

## Tema 2 — Protección contra accesos no autorizados (RNF-008)

### HU-AUTH-04 — Bloqueo de cuenta por intentos fallidos
**Como** sistema, **quiero** bloquear temporalmente una cuenta tras varios intentos fallidos de login **para** mitigar ataques de fuerza bruta (RNF-008), usando las columnas `usuario.intentos_fallidos` / `usuario.bloqueado_hasta` que ya existen en el schema `identity` pero no se usan.

**Criterios de aceptación:**
- Cada intento fallido de login incrementa `intentos_fallidos` del usuario correspondiente.
- Al superar un umbral configurable (ej. 5 intentos), se fija `bloqueado_hasta = ahora + N minutos` y las siguientes solicitudes de login responden `423` con `CuentaBloqueadaError{bloqueadoHasta}` (forma ya definida en `auth.yaml`).
- Un login exitoso resetea `intentos_fallidos` a 0.
- `POST /auth/refresh` también respeta el bloqueo: si la cuenta quedó bloqueada después de emitido el refresh token, el refresh responde `423` (comportamiento ya descrito en `auth.yaml`), no emite un nuevo access token.
- El umbral de intentos y minutos de bloqueo son configurables por variable de entorno (el ERS deja los valores "X" sin definir explícitamente).

**Estado actual:** No implementado — `login()` compara password sin ningún conteo ni bloqueo; las columnas de BD existen pero no se leen ni escriben desde este servicio.

### HU-AUTH-05 — Política de complejidad de contraseña
**Como** sistema, **quiero** exigir una contraseña alfanumérica con caracteres especiales y longitud mínima en el registro **para** cumplir RNF-008 ("políticas de contraseña").

**Criterios de aceptación:**
- `RegisterDto.password` valida (además del `MinLength(8)` actual): al menos una letra, al menos un número, al menos un carácter especial.
- El mensaje de error de validación es claro y en español (consistente con el resto del contrato).
- La longitud mínima exacta y el set de caracteres especiales exigidos quedan documentados como decisión de equipo (el ERS no los especifica).

**Estado actual:** Solo hay `MinLength(8)`/`MaxLength(128)` en `RegisterDto` — sin regla de complejidad (`@Matches`).

---

## Tema 3 — Gestión de usuarios y roles (RNF-004, §5 del ERS)

El ERS asigna explícitamente al rol `administrador` la responsabilidad de "gestión de usuarios y roles" (§5) y "configuración general, parametrización de servicios" — hoy el servicio solo permite auto-registro público, sin ninguna operación administrativa sobre usuarios existentes.

### HU-AUTH-06 — Administrador gestiona usuarios internos
**Como** administrador del sistema, **quiero** listar, consultar, actualizar y desactivar usuarios internos (técnicos, administrativos, otros administradores) **para** controlar quién tiene acceso al sistema sin depender del auto-registro público.

**Criterios de aceptación:**
- `GET /auth/usuarios` (o equivalente) lista usuarios internos, protegido con `x-roles: [administrador]`, paginado (`PageParam`/`PageSizeParam` de `common.yaml`).
- `GET /auth/usuarios/{id}` consulta un usuario puntual.
- `PATCH /auth/usuarios/{id}` permite actualizar campos no inmutables (teléfono, rol, estado) — documentar cuáles campos son inmutables (ej. `numeroIdentificacion`).
- `DELETE /auth/usuarios/{id}` es baja lógica (`activo=false`), responde `200` con el recurso actualizado, nunca `204` ni borrado físico (consistente con la política de borrado lógico del proyecto).
- El endpoint actual `POST /auth/register` se reevalúa: ¿sigue siendo público (autoregistro de qué rol?) o pasa a ser `administrador`-only para crear personal interno? Esto no está resuelto ni en el código ni en el contrato — requiere decisión explícita antes de implementar.

**Estado actual:** No implementado. Solo existe `AuthQueryService.getById()` (uso interno de `/auth/me`), sin exposición administrativa, sin actualización ni baja de usuarios.

### HU-AUTH-07 — Resolver el modelo de roles (`usuario_rol` vs `x-roles`)
**Como** equipo de desarrollo, **quiero** una decisión explícita sobre cómo se relacionan `identity.usuario_rol` (catálogo con `nivel_permisos` 1–10) y el enum fijo de 5 valores de `x-roles` (`administrador, tecnico, administrativo, cliente, sistema`) **para** poder emitir JWTs con roles que el resto de los microservicios pueda verificar de forma consistente.

**Criterios de aceptación:**
- Se documenta la decisión (mapeo 1:1 `usuario_rol.nombre → x-roles`, o los dos niveles coexisten con reglas de composición) en `CLAUDE.md` de este repo y se refleja en `ESQUEMA_DATOS.md`/`auth.yaml`.
- El JWT emitido (`roles: string[]`) usa valores que **sí** coinciden con los 5 valores de `x-roles` esperados por los guards de otros microservicios — hoy el código mete `user.rol.nombre` tal cual esté en BD, sin garantía de que coincida con el enum.
- Si se decide exponer gestión del catálogo `usuario_rol` (crear/editar roles con su `nivel_permisos`), se define como HU aparte con `x-roles: [administrador]`.

**Estado actual:** Sin resolver — señalado como pendiente explícito en `ESQUEMA_DATOS.md` §6 y confirmado como discrepancia real en el código (`UsuarioRol.nombre` es texto libre de BD, no el enum `Rol` del contrato).

---

## Tema 4 — Validación de identidad para clientes / asistente virtual (RNF-006, RF-056)

El schema `identity` incluye `token_verificacion`, pensado explícitamente para "OTP genérico reutilizado para tres propósitos (`otp_checklist`, `otp_cotizacion`, `otp_identidad`)" (`ESQUEMA_DATOS.md`). RF-056 (validación de identidad del cliente antes de compartir información sensible por WhatsApp) y la aprobación de checklist (RF-020, "código OTP (WhatsApp/correo) o botón de aceptación") dependen de este mecanismo, pero **ningún microservicio lo implementa todavía** — es candidato natural para este auth-service porque la tabla vive en su mismo schema.

### HU-AUTH-08 — Emitir OTP de un solo uso
**Como** módulo de asistente virtual (rol `sistema`), **quiero** solicitar la emisión de un OTP asociado a un propósito (`otp_identidad`, `otp_checklist`, `otp_cotizacion`) y un canal (correo/WhatsApp) **para** poder validar al cliente antes de compartir información sensible o antes de aprobar un checklist/cotización.

**Criterios de aceptación:**
- Endpoint (ej. `POST /auth/otp`) recibe `canal` (correo/whatsapp), `proposito`, y el identificador del destinatario (teléfono o email — **no** necesariamente un `usuario` de `identity`, puede ser un `cliente` de `customer`, revisar si esto pertenece aquí o a un endpoint propio de `customer`).
- El OTP generado es de un solo uso, con expiración corta (minutos, configurable), y se persiste en `identity.token_verificacion`.
- `x-roles: [sistema]` o `[publico]` según quién lo dispare — decidir explícitamente (probablemente el asistente virtual actúa como `sistema`).
- No debe filtrar el valor del OTP en logs (RNF-005, protección de datos sensibles).

### HU-AUTH-09 — Verificar OTP
**Como** módulo de asistente virtual o de checklist, **quiero** verificar un OTP recibido del usuario **para** confirmar identidad (RF-056) o aprobación (RF-020) antes de continuar el flujo.

**Criterios de aceptación:**
- Endpoint (ej. `POST /auth/otp/verificar`) recibe el identificador + código, responde válido/inválido.
- Un OTP usado o expirado no puede reutilizarse (invalidación tras un intento exitoso).
- Reintentos fallidos también deberían tener un límite (mismo principio que HU-AUTH-04) para que el OTP no sea vulnerable a fuerza bruta de 6 dígitos.

**Estado actual:** No implementado en ningún microservicio conocido — este análisis es el primer punto en documentarlo como brecha explícita. Requiere primero decidir en qué servicio vive (¿`aureon-auth-back` por compartir schema `identity`, o un servicio de `customer`/`assistant`?) antes de construir.

---

## Tema 5 — Auditoría y trazabilidad (RNF-007, RNF-013, regla transversal #5)

### HU-AUTH-10 — Registro de eventos de acceso
**Como** administrador del sistema, **quiero** que cada login exitoso, login fallido, logout y cambio de rol quede registrado con usuario, fecha/hora y resultado **para** cumplir RNF-007 (registro de actividad) y la regla transversal de trazabilidad obligatoria.

**Criterios de aceptación:**
- Cada intento de login (éxito o fallo) genera un registro de auditoría (tabla propia o log estructurado) con `email`/`numeroIdentificacion`, timestamp, resultado, IP/origen si está disponible.
- Los cambios administrativos sobre usuarios (HU-AUTH-06) quedan igualmente auditados: quién hizo el cambio, cuándo, qué cambió.
- No se registra la contraseña en texto plano ni el hash en ningún log (RNF-005).

**Estado actual:** Solo se loguean errores 5xx no controlados (`GlobalExceptionFilter`); no hay auditoría de negocio (logins, cambios de usuario).

---

## Tema 6 — Cumplimiento legal de datos personales (RNF-019–021, Ley 1581/2012)

### HU-AUTH-11 — Baja lógica de usuario, nunca física
**Como** sistema, **quiero** que desactivar un usuario interno lo marque `activo=false` sin borrar la fila **para** cumplir RNF-021 (derechos ARCO) y RNF-024 (retención ≥ 5 años), igual que ya aplica al resto de contratos del proyecto.

**Criterios de aceptación:** cubierto por HU-AUTH-06 (`DELETE` → `200` con recurso actualizado, `activo=false`). Se añade aquí solo para dejar explícita la justificación legal, no es una HU nueva independiente.

### HU-AUTH-12 — Bloquear login de usuario inactivo con mensaje explícito
**Como** usuario cuya cuenta fue desactivada, **quiero** recibir un mensaje claro al intentar iniciar sesión **para** entender que mi cuenta está inactiva (sin filtrar si el motivo fue una baja administrativa vs. credenciales incorrectas, por seguridad).

**Estado actual:** ✅ Ya cubierto — `login()` ya verifica `user.activo` y responde `401 INVALID_CREDENTIALS` genérico (correcto, no debería distinguir el motivo exacto por seguridad). No requiere trabajo adicional, se documenta como comportamiento ya conforme.

---

## Tema 7 — Alineación técnica con el contrato OpenAPI

Este tema es transversal a los anteriores pero se aísla porque es un prerrequisito de forma (no de negocio) antes de que cualquier frontend o API Gateway pueda consumir el servicio de forma confiable.

### HU-AUTH-13 — Unificar forma de respuesta y de error
**Como** consumidor del API (frontend, API Gateway, otros microservicios), **quiero** que las respuestas de éxito y error tengan exactamente la forma que `auth.yaml`/`common.yaml` definen **para** poder integrar sin parches ad-hoc por servicio.

**Criterios de aceptación:**
- Respuesta de error usa `{codigo, mensaje, detalles?}` (`common.yaml#Error`), no `{success, statusCode, error, message, timestamp, path}` actual.
- Respuesta de `/auth/login` usa los nombres de campo de `LoginResponse` (`token`, `tipoToken`, `expiraEn`, `refreshToken`, `refreshExpiraEn`, `usuario`, `permisos`) en vez de `{accessToken, user}`.
- `UsuarioAutenticado` en la respuesta usa `id`/`correo`/`nombre`/`rol` (enum)/`clienteId`/`tecnicoId`/`activo` — implica mapear el modelo interno (`Usuario` con `numeroIdentificacion`/`email`/`idUsuarioRol`) a este DTO de salida, no exponerlo tal cual.
- Se decide (con el Product Owner) si el `ResponseInterceptor` de envoltura genérica (`{success, data, ...}`) se mantiene por decisión de arquitectura transversal de microservicios, o se retira porque el contrato no lo contempla — **no asumir**, es una decisión de producto, no solo técnica.

**Estado actual:** Confirmado en el análisis previo (`CLAUDE.md` del repo) — ninguna de las formas coincide hoy.

### HU-AUTH-14 — Emitir `permisos` efectivos derivados del rol
**Como** frontend, **quiero** recibir en el login el arreglo de permisos efectivos del usuario **para** mostrar/ocultar acciones sin tener que mantener yo mismo la matriz rol→permiso.

**Criterios de aceptación:**
- `LoginResponse.permisos` se calcula a partir de `usuario_rol` (o de una tabla de permisos por rol, si se decide crear una) y no queda vacío ni hardcodeado.
- Ligado directamente a la resolución de HU-AUTH-07 (roles) — no puede implementarse sin decidir antes el mapeo de roles.

**Estado actual:** No implementado — no existe ningún concepto de "permiso" en el dominio actual, solo `rol`.

---

## Priorización sugerida

No hay una única secuencia correcta, pero un orden razonable dado que RNF-008/RNF-004 son **[Alta]** en el ERS y que varias HU son prerrequisito de otras:

1. **HU-AUTH-13** (forma de respuesta/error) y **HU-AUTH-07** (roles) — desbloquean todo lo demás, son de "forma" antes que de "función".
2. **HU-AUTH-04/05** (bloqueo por intentos + política de password) — seguridad básica [Alta], bajo esfuerzo.
3. **HU-AUTH-01/02/03** (refresh real + logout + expiración) — cierre del ciclo de sesión, esfuerzo medio-alto (requiere tabla `sesion_usuario`).
4. **HU-AUTH-06** (gestión de usuarios por admin) — necesario para operar el sistema sin acceso directo a BD.
5. **HU-AUTH-10** (auditoría) — RNF-007 es **[Baja]** en el ERS, puede ir en paralelo sin bloquear nada.
6. **HU-AUTH-08/09** (OTP) — depende de decidir primero si vive en este servicio; podría desacoplarse a otro microservicio sin bloquear el resto del backlog de auth.
7. **HU-AUTH-14** (permisos efectivos) — depende de HU-AUTH-07, es la de menor urgencia relativa (RNF-004 ya se cumple con roles simples).

Ninguna de estas historias está confirmada con el Product Owner (Nicolás Fajardo) — este documento es un punto de partida para esa conversación, no un compromiso de alcance.
