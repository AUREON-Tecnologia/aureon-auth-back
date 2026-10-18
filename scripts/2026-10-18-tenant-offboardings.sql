-- =====================================================================================================================
-- app_auth.tenant_offboardings: acta del fin de contrato de un tenant (política de datos: devolver o eliminar los datos
-- dentro de los 30 días siguientes a la terminación). Refleja el modelo TenantOffboarding de prisma/schema.prisma.
-- SIN FK a app_auth.tenants a propósito: el acta debe sobrevivir al borrado del tenant (es el registro del borrado).
-- No guarda datos personales: ids, códigos, fechas, estadísticas agregadas y conteos.
-- Idempotente: se puede ejecutar más de una vez.
-- =====================================================================================================================
BEGIN;

CREATE TABLE IF NOT EXISTS app_auth.tenant_offboardings (
    id                  uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           uuid          NOT NULL,
    tenant_code         varchar(100)  NOT NULL,
    tenant_name         varchar(255)  NOT NULL,
    status              varchar(16)   NOT NULL
                        CONSTRAINT tenant_offboardings_status_chk CHECK (status IN ('TERMINATED', 'CANCELLED', 'PURGED')),
    terminated_at       timestamptz   NOT NULL,
    terminated_by       uuid          NOT NULL,
    termination_reason  text          NOT NULL,
    purge_after         timestamptz   NOT NULL,
    cancelled_at        timestamptz,
    cancelled_by        uuid,
    exports             jsonb         NOT NULL DEFAULT '[]'::jsonb,
    purge_step          varchar(24),
    purge_started_at    timestamptz,
    purged_at           timestamptz,
    purged_by           uuid,
    early_purge_reason  text,
    stats               jsonb,
    orphan_user_ids     jsonb,
    deleted_counts      jsonb,
    created_at          timestamptz   NOT NULL DEFAULT now(),
    updated_at          timestamptz   NOT NULL DEFAULT now(),
    CONSTRAINT tenant_offboardings_purged_chk CHECK (status <> 'PURGED' OR (purged_at IS NOT NULL AND purged_by IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS tenant_offboardings_tenant_id_idx ON app_auth.tenant_offboardings (tenant_id);
-- A lo sumo un proceso abierto (TERMINATED) por tenant.
CREATE UNIQUE INDEX IF NOT EXISTS tenant_offboardings_one_open_per_tenant
    ON app_auth.tenant_offboardings (tenant_id) WHERE status = 'TERMINATED';

COMMIT;
