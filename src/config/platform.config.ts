import { registerAs } from '@nestjs/config';

/** HU_13: no hay rol "super-admin de plataforma" en el schema — POST /tenants se protege con este secreto. */
export default registerAs('platform', () => ({
  bootstrapKey: process.env.PLATFORM_BOOTSTRAP_KEY ?? '',
  defaultRoleCodeRegistro: process.env.PLATFORM_DEFAULT_ROLE_CODE ?? 'cliente',
}));
