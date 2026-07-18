import { SetMetadata } from '@nestjs/common';
import { RolNegocio } from '../domain/rol-negocio';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: RolNegocio[]) => SetMetadata(ROLES_KEY, roles);
