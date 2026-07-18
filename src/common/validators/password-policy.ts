/** HU_05: politica minima de contrasena (RNF-008) — compartida por register, bootstrap de tenant y reset de password. */
export const REGEX_PASSWORD_COMPLEJA =
  /^(?=.*[A-Za-z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]).+$/;

export const MENSAJE_PASSWORD_COMPLEJA =
  'La contrasena debe tener al menos una letra, un numero y un caracter especial';
