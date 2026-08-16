-- Renames the Spanish "clientes"/"usuarios" module + permission codes to
-- English ("clients"/"users"), matching the source-code rename in
-- src/modules/rbac/domain/permisos-catalogo-legacy.ts (2026-08-15).
--
-- Why this is a plain UPDATE, not a delete+reseed: `RolePermission` and
-- `UserPermission` reference `permissions.id` (a FK), not `code`. Renaming
-- the `code` column in place preserves the row's `id`, so every existing
-- grant (role_permissions/user_permissions) for every tenant created before
-- this migration — e.g. `aureon-1` — keeps working with zero data loss.
-- The alternative (letting RbacSeedService's find-or-create just insert new
-- rows for the new codes on next tenant bootstrap) would orphan the old
-- Spanish-coded rows and leave every pre-existing tenant's roles pointing
-- at permissions the updated guards no longer check for.
--
-- Idempotent: safe to run more than once. After the first run, the `WHERE
-- code = '<old>'` clauses match zero rows, so a re-run is a no-op.
--
-- Run against the production DB (Railway) with, e.g.:
--   psql "$DATABASE_URL" -f scripts/2026-08-15-rename-permission-codes-en.sql
-- or paste into Railway's Postgres query console.
--
-- Schema: tables live under `auth.` (confirmed against the live DB, not the
-- `public` default assumed in the first version of this script — Prisma's
-- schema.prisma doesn't declare it explicitly, but the deployed DB's search
-- path/connection puts these tables in `auth`, same as `auth.v_user_effective_permissions`).
--
-- Before running: if a previous attempt aborted mid-transaction, run
-- `ROLLBACK;` first to clear the aborted state before retrying. If the
-- UPDATE below fails with a unique-constraint violation on `code`, it means
-- a row with the *new* English code already exists (e.g. a tenant was
-- bootstrapped after the source-code rename deployed) — this script does a
-- plain rename and does NOT handle that case; it needs to become a
-- merge-and-delete (repoint role_permissions/user_permissions from the old
-- id to the existing new-code id, then delete the old row) instead. Check
-- with the diagnostic SELECT below before assuming a plain rename is safe.

BEGIN;

UPDATE auth.modules SET code = 'clients' WHERE code = 'clientes';
UPDATE auth.modules SET code = 'users'   WHERE code = 'usuarios';

UPDATE auth.permissions SET code = 'clients:list'   WHERE code = 'clientes:listar';
UPDATE auth.permissions SET code = 'clients:create' WHERE code = 'clientes:crear';
UPDATE auth.permissions SET code = 'clients:update' WHERE code = 'clientes:editar';
UPDATE auth.permissions SET code = 'clients:delete' WHERE code = 'clientes:eliminar';

UPDATE auth.permissions SET code = 'users:list'       WHERE code = 'usuarios:listar';
UPDATE auth.permissions SET code = 'users:create'     WHERE code = 'usuarios:crear';
UPDATE auth.permissions SET code = 'users:update'     WHERE code = 'usuarios:editar';
UPDATE auth.permissions SET code = 'users:deactivate' WHERE code = 'usuarios:desactivar';

-- Sanity check: no Spanish-coded rows should remain for these two modules.
-- Expect zero rows back from this SELECT before COMMIT.
SELECT code FROM auth.modules WHERE code IN ('clientes', 'usuarios')
UNION ALL
SELECT code FROM auth.permissions WHERE code IN (
  'clientes:listar', 'clientes:crear', 'clientes:editar', 'clientes:eliminar',
  'usuarios:listar', 'usuarios:crear', 'usuarios:editar', 'usuarios:desactivar'
);

COMMIT;
