import { groupPermissionsByModule } from '../../src/common/utils/group-permissions.util';

describe('groupPermissionsByModule', () => {
  it('agrupa multiples recursos bajo un mismo modulo (caso rbac-core)', () => {
    const permissions = [
      'roles:list',
      'roles:create',
      'roles:assign-permission',
      'permissions:list',
      'permissions:assign-direct',
      'memberships:read',
    ];
    const moduleCodeByPermission = {
      'roles:list': 'rbac-core',
      'roles:create': 'rbac-core',
      'roles:assign-permission': 'rbac-core',
      'permissions:list': 'rbac-core',
      'permissions:assign-direct': 'rbac-core',
      'memberships:read': 'rbac-core',
    };

    const result = groupPermissionsByModule(permissions, moduleCodeByPermission);

    expect(result).toEqual({
      'RBAC-CORE': {
        ROLES: ['LIST', 'CREATE', 'ASSIGN-PERMISSION'],
        PERMISSIONS: ['LIST', 'ASSIGN-DIRECT'],
        MEMBERSHIPS: ['READ'],
      },
    });
  });

  it('cuando el recurso y el modulo coinciden (caso clients), agrupa bajo el mismo nombre', () => {
    const permissions = ['clients:list', 'clients:create', 'clients:update', 'clients:delete'];
    const moduleCodeByPermission = {
      'clients:list': 'clients',
      'clients:create': 'clients',
      'clients:update': 'clients',
      'clients:delete': 'clients',
    };

    const result = groupPermissionsByModule(permissions, moduleCodeByPermission);

    expect(result).toEqual({
      CLIENTS: { CLIENTS: ['LIST', 'CREATE', 'UPDATE', 'DELETE'] },
    });
  });

  it('usa el recurso como fallback de modulo si no hay entrada en moduleCodeByPermission', () => {
    const result = groupPermissionsByModule(['reportes:ver'], {});

    expect(result).toEqual({ REPORTES: { REPORTES: ['VER'] } });
  });

  it('ignora silenciosamente un codigo sin ":" en vez de explotar', () => {
    const result = groupPermissionsByModule(['codigo-malformado'], {});

    expect(result).toEqual({});
  });

  it('no traduce el vocabulario de accion -- solo lo pone en mayuscula tal cual viene', () => {
    const result = groupPermissionsByModule(['users:deactivate'], { 'users:deactivate': 'users' });

    expect(result).toEqual({ USERS: { USERS: ['DEACTIVATE'] } });
  });
});
