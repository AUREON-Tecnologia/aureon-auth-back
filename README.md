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
- `@supabase/supabase-js` para conexión a PostgreSQL
- `@nestjs/jwt` para tokens
- `bcrypt` para hash de contraseñas
- Clean Architecture + CQRS manual

## Endpoints

| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| GET | /health | No | Health check |
| POST | /auth/register | No | Crear usuario |
| POST | /auth/login | No | Login |
| POST | /auth/refresh | No | Renovar token |
| GET | /auth/me | Sí | Perfil del usuario |

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

## Docker

```bash
docker compose up --build
```

## Variables de entorno

Ver `.env.example`. Las variables críticas son:
- `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` — conexión a BD
- `JWT_SECRET` — debe ser **idéntica** a la del API Gateway

## Despliegue

Pipeline CI/CD en Azure DevOps → GHCR → Render.
Ver `azure-pipelines.yml` y la guía arquitectural.