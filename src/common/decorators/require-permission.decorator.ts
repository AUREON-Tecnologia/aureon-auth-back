import { SetMetadata } from '@nestjs/common';

export const PERMISSION_KEY = 'permission';

/** Codigo de permiso granular estilo "recurso:accion" (ej. "users:list"), resuelto contra v_user_effective_permissions. */
export const RequirePermission = (permissionCode: string) => SetMetadata(PERMISSION_KEY, permissionCode);
