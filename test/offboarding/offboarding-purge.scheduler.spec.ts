import { ConfigService } from '@nestjs/config';
import type Redis from 'ioredis';
import type { TenantOffboardingService } from '../../src/modules/offboarding/application/tenant-offboarding.service';
import {
  AUTO_PURGE_LOCK_KEY,
  OffboardingPurgeScheduler,
} from '../../src/modules/offboarding/infrastructure/offboarding-purge.scheduler';

function fakeRedis(held = false) {
  const store = new Map<string, string>();
  if (held) store.set(AUTO_PURGE_LOCK_KEY, 'someone-else');
  const redis = {
    set: jest.fn(async (key: string, value: string) => {
      if (store.has(key)) return null;
      store.set(key, value);
      return 'OK';
    }),
    eval: jest.fn(async (_script: string, _n: number, key: string, token: string) => {
      if (store.get(key) !== token) return 0;
      store.delete(key);
      return 1;
    }),
  };
  return { redis, store };
}

function setup(opts: { enabled?: boolean; redis?: unknown; fail?: boolean } = {}) {
  const purgeDue = jest.fn(async () => {
    if (opts.fail) throw new Error('db down');
    return { due: 2, purged: 2, failed: 0 };
  });
  const config = new ConfigService({ offboarding: { autoPurgeEnabled: opts.enabled ?? true } });
  const scheduler = new OffboardingPurgeScheduler(
    { purgeDue } as unknown as TenantOffboardingService,
    config,
    (opts.redis ?? null) as Redis | null,
  );
  return { scheduler, purgeDue };
}

describe('OffboardingPurgeScheduler', () => {
  it('runs the purge under the Redis lock and releases it afterwards', async () => {
    const { redis, store } = fakeRedis();
    const { scheduler, purgeDue } = setup({ redis });
    await scheduler.run();
    expect(purgeDue).toHaveBeenCalledTimes(1);
    expect(redis.set).toHaveBeenCalledWith(
      AUTO_PURGE_LOCK_KEY,
      expect.any(String),
      'EX',
      3600,
      'NX',
    );
    expect(store.has(AUTO_PURGE_LOCK_KEY)).toBe(false);
  });

  it('skips when another instance holds the lock, and does not release it', async () => {
    const { redis, store } = fakeRedis(true);
    const { scheduler, purgeDue } = setup({ redis });
    await scheduler.run();
    expect(purgeDue).not.toHaveBeenCalled();
    expect(store.get(AUTO_PURGE_LOCK_KEY)).toBe('someone-else');
  });

  it('releases the lock even when the purge throws', async () => {
    const { redis, store } = fakeRedis();
    const { scheduler } = setup({ redis, fail: true });
    await expect(scheduler.run()).resolves.toBeUndefined();
    expect(store.has(AUTO_PURGE_LOCK_KEY)).toBe(false);
  });

  it('skips when Redis cannot be reached (no lock, no purge)', async () => {
    const redis = { set: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')), eval: jest.fn() };
    const { scheduler, purgeDue } = setup({ redis });
    await scheduler.run();
    expect(purgeDue).not.toHaveBeenCalled();
  });

  it('runs without a lock when Redis is not configured', async () => {
    const { scheduler, purgeDue } = setup({ redis: null });
    await scheduler.run();
    expect(purgeDue).toHaveBeenCalledTimes(1);
  });

  it('does nothing when disabled', async () => {
    const { redis } = fakeRedis();
    const { scheduler, purgeDue } = setup({ enabled: false, redis });
    await scheduler.run();
    expect(purgeDue).not.toHaveBeenCalled();
    expect(redis.set).not.toHaveBeenCalled();
  });
});
