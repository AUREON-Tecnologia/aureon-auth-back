-- ============================================================
-- AUTH SERVICE — adaptado de docus/scripts-v3/scripts-auth.sql
-- para vivir DENTRO del schema `auth` ya existente de Supabase
-- (GoTrue). No se toca ningun objeto preexistente de auth.* —
-- solo se agregan tablas nuevas. `users` se renombro a
-- `app_users` para no chocar con auth.users (Supabase Auth).
-- ============================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto" SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "citext" SCHEMA extensions;

-- GRUPO 1: IDENTIDAD GLOBAL

CREATE TABLE auth.tenants (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    code        VARCHAR(100) NOT NULL UNIQUE,
    name        VARCHAR(255) NOT NULL,
    is_active   BOOLEAN     NOT NULL DEFAULT TRUE,
    settings    JSONB       NOT NULL DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE auth.app_users (
    id                    UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    email                 CITEXT       NOT NULL UNIQUE,
    password_hash         VARCHAR(255),
    email_verified_at     TIMESTAMPTZ,
    first_name            VARCHAR(100),
    last_name             VARCHAR(100),
    is_active             BOOLEAN      NOT NULL DEFAULT TRUE,
    last_login_at         TIMESTAMPTZ,
    failed_login_attempts INT          NOT NULL DEFAULT 0,
    locked_until          TIMESTAMPTZ,
    created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    deleted_at            TIMESTAMPTZ
);

-- GRUPO 2: RBAC POR TENANT

CREATE TABLE auth.permissions (
    id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID         NOT NULL REFERENCES auth.tenants(id) ON DELETE CASCADE,
    code        VARCHAR(100) NOT NULL,
    name        VARCHAR(255) NOT NULL,
    resource    VARCHAR(100) NOT NULL,
    action      VARCHAR(50)  NOT NULL,
    is_active   BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, code)
);

CREATE TABLE auth.roles (
    id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID         NOT NULL REFERENCES auth.tenants(id) ON DELETE CASCADE,
    code        VARCHAR(100) NOT NULL,
    name        VARCHAR(255) NOT NULL,
    description TEXT,
    is_active   BOOLEAN      NOT NULL DEFAULT TRUE,
    is_system   BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, code)
);

CREATE TABLE auth.role_permissions (
    role_id       UUID        NOT NULL REFERENCES auth.roles(id) ON DELETE CASCADE,
    permission_id UUID        NOT NULL REFERENCES auth.permissions(id) ON DELETE CASCADE,
    granted_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    granted_by    UUID        REFERENCES auth.app_users(id) ON DELETE SET NULL,
    PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE auth.user_tenant_memberships (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID        NOT NULL REFERENCES auth.app_users(id) ON DELETE CASCADE,
    tenant_id   UUID        NOT NULL REFERENCES auth.tenants(id) ON DELETE CASCADE,
    role_id     UUID        NOT NULL REFERENCES auth.roles(id) ON DELETE RESTRICT,
    is_active   BOOLEAN     NOT NULL DEFAULT TRUE,
    joined_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    invited_by  UUID        REFERENCES auth.app_users(id) ON DELETE SET NULL,
    expires_at  TIMESTAMPTZ,
    UNIQUE (user_id, tenant_id)
);

CREATE TABLE auth.user_permissions (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID        NOT NULL REFERENCES auth.app_users(id) ON DELETE CASCADE,
    permission_id UUID        NOT NULL REFERENCES auth.permissions(id) ON DELETE CASCADE,
    effect        VARCHAR(10) NOT NULL DEFAULT 'ALLOW' CHECK (effect IN ('ALLOW', 'DENY')),
    granted_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    granted_by    UUID        REFERENCES auth.app_users(id) ON DELETE SET NULL,
    expires_at    TIMESTAMPTZ,
    reason        TEXT,
    UNIQUE (user_id, permission_id)
);

-- GRUPO 3: SESIONES Y TOKENS

CREATE TABLE auth.user_sessions (
    id                 UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id            UUID         NOT NULL REFERENCES auth.app_users(id) ON DELETE CASCADE,
    tenant_id          UUID         NOT NULL REFERENCES auth.tenants(id) ON DELETE CASCADE,
    refresh_token_hash VARCHAR(255) NOT NULL UNIQUE,
    user_agent         TEXT,
    ip_address         INET,
    expires_at         TIMESTAMPTZ  NOT NULL,
    revoked_at         TIMESTAMPTZ,
    created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    last_used_at       TIMESTAMPTZ
);

CREATE TABLE auth.user_tokens (
    id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID         NOT NULL REFERENCES auth.app_users(id) ON DELETE CASCADE,
    type        VARCHAR(50)  NOT NULL CHECK (type IN ('EMAIL_VERIFICATION', 'PASSWORD_RESET', 'MFA_SETUP')),
    token_hash  VARCHAR(255) NOT NULL UNIQUE,
    expires_at  TIMESTAMPTZ  NOT NULL,
    used_at     TIMESTAMPTZ,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- INDICES

CREATE INDEX idx_app_users_email      ON auth.app_users(email) WHERE deleted_at IS NULL;
CREATE INDEX idx_app_users_locked     ON auth.app_users(locked_until) WHERE locked_until IS NOT NULL;
CREATE INDEX idx_permissions_tenant   ON auth.permissions(tenant_id);
CREATE INDEX idx_roles_tenant         ON auth.roles(tenant_id);
CREATE INDEX idx_rp_role              ON auth.role_permissions(role_id);
CREATE INDEX idx_rp_permission        ON auth.role_permissions(permission_id);
CREATE INDEX idx_utm_user             ON auth.user_tenant_memberships(user_id);
CREATE INDEX idx_utm_tenant           ON auth.user_tenant_memberships(tenant_id);
CREATE INDEX idx_utm_role             ON auth.user_tenant_memberships(role_id);
CREATE INDEX idx_up_user_permission   ON auth.user_permissions(user_id, permission_id);
CREATE INDEX idx_sessions_user_tenant ON auth.user_sessions(user_id, tenant_id) WHERE revoked_at IS NULL;
CREATE INDEX idx_sessions_expires     ON auth.user_sessions(expires_at) WHERE revoked_at IS NULL;
CREATE INDEX idx_tokens_user_type     ON auth.user_tokens(user_id, type) WHERE used_at IS NULL;

-- TRIGGERS: VALIDACION CROSS-TENANT

CREATE OR REPLACE FUNCTION auth.fn_check_role_permission_tenant()
RETURNS TRIGGER AS $$
BEGIN
    IF (SELECT tenant_id FROM auth.roles WHERE id = NEW.role_id) !=
       (SELECT tenant_id FROM auth.permissions WHERE id = NEW.permission_id) THEN
        RAISE EXCEPTION 'El role y el permission deben pertenecer al mismo tenant';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_role_permissions_same_tenant
BEFORE INSERT OR UPDATE ON auth.role_permissions
FOR EACH ROW EXECUTE FUNCTION auth.fn_check_role_permission_tenant();

CREATE OR REPLACE FUNCTION auth.fn_check_membership_role_tenant()
RETURNS TRIGGER AS $$
BEGIN
    IF (SELECT tenant_id FROM auth.roles WHERE id = NEW.role_id) != NEW.tenant_id THEN
        RAISE EXCEPTION 'El role debe pertenecer al tenant de la membresía';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_membership_role_tenant
BEFORE INSERT OR UPDATE ON auth.user_tenant_memberships
FOR EACH ROW EXECUTE FUNCTION auth.fn_check_membership_role_tenant();

-- VISTA DE PERMISOS EFECTIVOS

CREATE OR REPLACE VIEW auth.v_user_effective_permissions AS
WITH
  role_perms AS (
    SELECT
      utm.user_id,
      utm.tenant_id,
      rp.permission_id,
      'ROLE'  AS origin
    FROM auth.user_tenant_memberships utm
    JOIN auth.role_permissions rp ON rp.role_id = utm.role_id
    JOIN auth.roles r              ON r.id = utm.role_id        AND r.is_active = TRUE
    JOIN auth.permissions p        ON p.id = rp.permission_id   AND p.is_active = TRUE
    WHERE utm.is_active = TRUE
      AND (utm.expires_at IS NULL OR utm.expires_at > NOW())
  ),
  direct_perms AS (
    SELECT
      up.user_id,
      p.tenant_id,
      up.permission_id,
      up.effect AS origin
    FROM auth.user_permissions up
    JOIN auth.permissions p ON p.id = up.permission_id
    WHERE (up.expires_at IS NULL OR up.expires_at > NOW())
  ),
  denies AS (
    SELECT user_id, tenant_id, permission_id
    FROM direct_perms
    WHERE origin = 'DENY'
  )
SELECT DISTINCT
  COALESCE(rp.user_id, dp.user_id)             AS user_id,
  COALESCE(rp.tenant_id, dp.tenant_id)         AS tenant_id,
  COALESCE(rp.permission_id, dp.permission_id) AS permission_id
FROM role_perms rp
FULL OUTER JOIN direct_perms dp
  ON  dp.user_id       = rp.user_id
  AND dp.tenant_id     = rp.tenant_id
  AND dp.permission_id = rp.permission_id
  AND dp.origin        = 'ALLOW'
WHERE NOT EXISTS (
    SELECT 1 FROM denies d
    WHERE d.user_id       = COALESCE(rp.user_id, dp.user_id)
      AND d.tenant_id     = COALESCE(rp.tenant_id, dp.tenant_id)
      AND d.permission_id = COALESCE(rp.permission_id, dp.permission_id)
);

COMMIT;
