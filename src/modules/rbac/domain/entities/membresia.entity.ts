import { Rol } from './rol.entity';

export interface UsuarioResumen {
  id: string;
  email: string;
  primerNombre: string | null;
  apellido: string | null;
}

export class Membresia {
  constructor(
    public readonly id: string,
    public readonly userId: string,
    public readonly tenantId: string,
    public readonly rolId: string,
    public readonly activo: boolean,
    public readonly fechaIngreso: Date,
    public readonly fechaExpiracion: Date | null,
    public readonly rol?: Rol,
    public readonly usuario?: UsuarioResumen,
  ) {}
}
