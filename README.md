# auth-service

Microservicio de autenticación de Aureon Back.

## Descripción

Servicio independiente responsable de:
- Crear usuarios
- Validar credenciales
- Emitir y validar JWT
- Gestionar el perfil del usuario autenticado

Forma parte de la arquitectura de microservicios descrita en `BACKEND/GUIA_ARQUITECTURA_MICROSERVICIOS.md`.

## Stack

- NestJS 11 + TypeScript (strict)
- Prisma 6 sobre PostgreSQL (Supabase, schema `app_auth`)
- Redis (`@aureon/redis-client`) para la whitelist de sesiones del access token
- `@nestjs/jwt` para tokens
- `bcryptjs` para hash de contraseñas
- Clean Architecture + CQRS manual

## Endpoints

Todas las rutas del servicio salen bajo el prefijo `/auth`, que se aplica con `RouterModule` en `AppModule` (los `@Controller` de `rbac`, `tenants`, `platform` y `health` no llevan el prefijo). Resumen:

| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| GET | /auth/health | No | Health check |
| POST | /auth/register | No | Crear usuario |
| POST | /auth/login | No | Valida credenciales y devuelve `tenants` + `selectionToken` |
| POST | /auth/switch-tenant | Opcional | Abre sesión en un tenant |
| POST | /auth/refresh | No | Renovar token |
| POST | /auth/logout | No | Cerrar sesión |
| GET | /auth/me | Sí | Perfil del usuario |
| * | /auth/password/*, /auth/email/*, /auth/mfa/* | Varía | Self-service (reset de password, verificación de email, MFA) |
| * | /auth/tenants, /auth/modulos | Varía | Tenants y módulos |
| * | /auth/rbac/* | Sí | Roles, permisos y membresías |
| * | /auth/platform/* | Varía | Administración de plataforma |

El detalle completo (roles, permisos requeridos y contratos) está en `CLAUDE.md` y en `aureon-api-contracts`.

## Desarrollo local

```bash
# Instalar dependencias
npm install

# Copiar variables de entorno
cp .env.example .env

# Arrancar en modo dev
npm run start:dev

# Tests
npm run test
npm run test:cov
```

Requiere Redis en local (`docker compose up -d redis`) y `.env` con las credenciales de la base.

## Docker

```bash
docker compose up --build
```

Levanta el servicio (puerto 3001) y Redis. El healthcheck consulta `GET /auth/health`.

## Variables de entorno

Ver `.env.example`. Las variables críticas son:
- `DATABASE_URL` y `DIRECT_URL` — conexión a Postgres (Prisma)
- `JWT_SECRET` — debe ser **idéntica** en todos los microservicios AUREON que verifiquen el JWT (el gateway no lo valida)
- `REDIS_HOST` / `REDIS_PORT` — Redis es dependencia dura (sin él, login/refresh responden 503)
- `PLATFORM_BOOTSTRAP_KEY` — protege `POST /auth/tenants` y `/auth/platform/admins`

## Despliegue

El servicio se despliega en Railway. `azure-pipelines.yml` es histórico (los repos migraron de Azure DevOps a GitHub).