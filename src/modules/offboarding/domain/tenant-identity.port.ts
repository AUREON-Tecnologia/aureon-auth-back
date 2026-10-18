import { ServiceExport, ServiceStats } from './tenant-data-source.port';

export const TENANT_IDENTITY_STORE = Symbol('ITenantIdentityStore');

/** Identity's own (app_auth) side of a tenant's contract end. */
export interface ITenantIdentityStore {
  setActive(tenantId: string, active: boolean): Promise<void>;
  /** Revokes every refresh token and access-token session of the tenant. */
  revokeSessions(tenantId: string): Promise<{ refreshTokens: number; accessTokens: number }>;
  getStats(tenantId: string): Promise<ServiceStats>;
  /** Tenant, roles, memberships and the members' names/emails. Never password hashes, sessions or tokens. */
  getExport(tenantId: string): Promise<ServiceExport>;
  /** Users whose only membership is this tenant and who are not platform admins. */
  findTenantOnlyUsers(tenantId: string): Promise<string[]>;
  /** Deletes the tenant row; the database cascades to every tenant-scoped table of every schema. */
  deleteTenant(tenantId: string): Promise<boolean>;
  /**
   * Deletes those users; a user still referenced elsewhere (e.g. as who invited someone in another tenant) is
   * anonymized and deactivated instead, so no personal data remains either way.
   */
  removeUsers(userIds: string[]): Promise<{ deleted: number; anonymized: number }>;
}
