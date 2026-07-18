export type PropositoOtp = 'otp_checklist' | 'otp_cotizacion' | 'otp_identidad';

export const PROPOSITOS_OTP: PropositoOtp[] = ['otp_checklist', 'otp_cotizacion', 'otp_identidad'];

export class TokenVerificacion {
  constructor(
    public readonly id: string,
    public readonly idCliente: string | null,
    public readonly numeroTelefono: string | null,
    public readonly email: string | null,
    public readonly token: string,
    public readonly proposito: PropositoOtp,
    public readonly expiraEn: Date,
    public readonly usado: boolean,
    public readonly creadoEn: Date,
  ) {}
}
