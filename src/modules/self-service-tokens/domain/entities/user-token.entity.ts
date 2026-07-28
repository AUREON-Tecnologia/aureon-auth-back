export type TipoUserToken = 'EMAIL_VERIFICATION' | 'PASSWORD_RESET' | 'MFA_SETUP';

export class UserToken {
  constructor(
    public readonly id: string,
    public readonly userId: string,
    public readonly tipo: TipoUserToken,
    public readonly expiraEn: Date,
    public readonly usadoEn: Date | null,
    public readonly creadoEn: Date,
  ) {}

  get vigente(): boolean {
    return this.usadoEn === null && this.expiraEn.getTime() > Date.now();
  }
}
