/** HU_05: politica minima de contrasena (RNF-008) — compartida por register, bootstrap de tenant y reset de password. */
export const REGEX_PASSWORD_COMPLEJA =
  /^(?=.*[A-Za-z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]).+$/;

export const MENSAJE_PASSWORD_COMPLEJA =
  'La contrasena debe tener al menos una letra, un numero y un caracter especial';

/**
 * Version en ingles del mismo mensaje, solo para RegisterDto — dentro del
 * alcance de auth.yaml, que ya no expone texto en espanol al frontend
 * (decision 2026-08-15). CrearTenantDto y RestablecerPasswordDto siguen
 * usando MENSAJE_PASSWORD_COMPLEJA (rbac/self-service-tokens, aun no
 * traducidos) — mismo regex, mensaje distinto por modulo.
 */
export const PASSWORD_POLICY_MESSAGE_EN =
  'Password must contain at least one letter, one digit, and one special character';
