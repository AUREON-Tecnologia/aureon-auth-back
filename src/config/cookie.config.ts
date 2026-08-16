import { registerAs } from '@nestjs/config';

/**
 * HU_13 (httpOnly cookies): the domain and the frontend origin change
 * depending on the environment — fully configurable via env vars. The
 * fallback values below are hardcoded on purpose (2026-08-15): Railway env
 * vars aren't reachable from this session, so these defaults keep the
 * deployed service working without them being set there. Once Railway env
 * vars are set (or a shared root domain exists), the env vars take
 * precedence and these hardcoded fallbacks stop mattering — remove them
 * then if they start feeling stale. See CLAUDE.md, "Autenticacion por
 * cookie" section.
 *
 * `sameSite` defaults to `none` (not `lax`): the frontend
 * (aureonshellfront-production.up.railway.app) and this service are on
 * unrelated Railway subdomains today (no shared root domain), so every
 * request from the browser is cross-site — `Lax` would never send the
 * cookie on fetch/XHR calls. Switch to `lax` once frontend and backends
 * share a root domain.
 */
export default registerAs('cookie', () => ({
  domain: process.env.COOKIE_DOMAIN || undefined,
  sameSite: (process.env.COOKIE_SAMESITE ?? 'none') as 'lax' | 'strict' | 'none',
  secure: (process.env.COOKIE_SECURE ?? 'true') === 'true',
  frontendOrigin: process.env.FRONTEND_ORIGIN ?? 'https://aureonshellfront-production.up.railway.app',
}));
