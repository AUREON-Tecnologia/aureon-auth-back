import { Modulo } from './modulo.entity';

export class TenantModulo {
  constructor(
    public readonly tenantId: string,
    public readonly moduloId: string,
    public readonly activo: boolean,
    public readonly activadoEn: Date,
    public readonly expiraEn: Date | null,
    public readonly modulo?: Modulo,
  ) {}
}
