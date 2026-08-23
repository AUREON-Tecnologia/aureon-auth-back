export type PermissionsByModule = Record<string, Record<string, string[]>>;

/**
 * Groups "resource:action" permission codes (e.g. "clients:list") by
 * owning module and resource, for the LoginResponse body -- does not
 * affect the flat `permissions` array signed into the JWT (that one is
 * still what PermissionsGuard checks across the rest of the ecosystem).
 * Action vocabulary is exactly as stored in the catalog, only uppercased
 * -- no translation table (decision 2026-08-22).
 */
export function groupPermissionsByModule(
  permissions: string[],
  moduleCodeByPermission: Record<string, string>,
): PermissionsByModule {
  const result: PermissionsByModule = {};

  for (const permissionCode of permissions) {
    const [resource, action] = permissionCode.split(':');
    if (!resource || !action) {
      continue; // defensive; today's catalog is always "resource:action"
    }

    const moduleKey = (moduleCodeByPermission[permissionCode] ?? resource).toUpperCase();
    const resourceKey = resource.toUpperCase();

    (result[moduleKey] ??= {})[resourceKey] ??= [];
    result[moduleKey][resourceKey].push(action.toUpperCase());
  }

  return result;
}
