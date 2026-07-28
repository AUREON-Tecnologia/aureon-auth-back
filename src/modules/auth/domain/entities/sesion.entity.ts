export class Sesion {
  constructor(
    public readonly id: string,
    public readonly userId: string,
    public readonly tenantId: string,
    public readonly expiraEn: Date,
    public readonly revocadaEn: Date | null,
    public readonly userAgent: string | null,
    public readonly ipAddress: string | null,
    public readonly creadaEn: Date,
  ) {}

  get activa(): boolean {
    return this.revocadaEn === null;
  }
}
