import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { REDIS_CLIENT } from '@aureon/redis-client';
import type Redis from 'ioredis';
import { randomUUID } from 'node:crypto';
import { TenantOffboardingService } from '../application/tenant-offboarding.service';

/** Only one replica runs the daily purge: a Redis lock that expires on its own if the process dies mid-run. */
export const AUTO_PURGE_LOCK_KEY = 'identity:offboarding:auto-purge:lock';
const LOCK_TTL_SECONDS = 60 * 60;
const RELEASE_IF_OWNER = `if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end`;

/**
 * Data policy v1.2, section 9: a company's data is deleted when the 30 days after termination end. Every day at 08:30
 * UTC (03:30 Colombia) it purges the due processes. One log line per run, also when there is nothing to purge, so a
 * missing line can raise an alert. A run lost to downtime is caught up by the next one.
 */
@Injectable()
export class OffboardingPurgeScheduler {
  private readonly logger = new Logger('OffboardingAutoPurge');

  constructor(
    private readonly offboarding: TenantOffboardingService,
    private readonly config: ConfigService,
    @Optional() @Inject(REDIS_CLIENT) private readonly redis: Redis | null = null,
  ) {}

  @Cron('0 30 8 * * *', { name: 'offboarding-auto-purge', timeZone: 'UTC' })
  async handleCron(): Promise<void> {
    await this.run();
  }

  async run(): Promise<void> {
    if (!this.config.get<boolean>('offboarding.autoPurgeEnabled', true)) {
      this.logger.log(
        'offboarding auto-purge skipped: disabled (OFFBOARDING_AUTO_PURGE_ENABLED=false)',
      );
      return;
    }

    const token = randomUUID();
    if (this.redis) {
      let acquired: string | null;
      try {
        acquired = await this.redis.set(AUTO_PURGE_LOCK_KEY, token, 'EX', LOCK_TTL_SECONDS, 'NX');
      } catch (error) {
        this.logger.error(
          `offboarding auto-purge skipped: Redis lock failed (${errorMessage(error)})`,
        );
        return;
      }
      if (acquired !== 'OK') {
        this.logger.log('offboarding auto-purge skipped: another instance holds the lock');
        return;
      }
    } else {
      this.logger.warn('offboarding auto-purge running without a lock: Redis is not configured');
    }

    try {
      const { due, purged, failed } = await this.offboarding.purgeDue();
      const line = `offboarding auto-purge due=${due} purged=${purged} failed=${failed}`;
      if (failed > 0) this.logger.error(line);
      else this.logger.log(line);
    } catch (error) {
      this.logger.error(`offboarding auto-purge failed: ${errorMessage(error)}`);
    } finally {
      if (this.redis) {
        await this.redis
          .eval(RELEASE_IF_OWNER, 1, AUTO_PURGE_LOCK_KEY, token)
          .catch(() => undefined);
      }
    }
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
