import type { DynamicModule } from '@nestjs/common';

export interface RedisModuleOptions {
  host: string;
  port: number;
  password?: string;
  db?: number;
  tls?: boolean;
  keyPrefix: string;
  isGlobal?: boolean;
}

export interface RedisModuleAsyncOptions {
  imports?: any[];
  inject?: any[];
  isGlobal?: boolean;
  useFactory: (
    ...args: any[]
  ) => Promise<Omit<RedisModuleOptions, 'isGlobal'>> | Omit<RedisModuleOptions, 'isGlobal'>;
}

export declare class RedisService {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSegundos?: number): Promise<void>;
  del(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  getClient(): never;
}

export declare class TokenBlacklistWriterService {
  revoke(jti: string | undefined, ttlSegundos: number): Promise<void>;
}

export declare class TokenBlacklistReaderService {
  isRevoked(jti: string | undefined): Promise<boolean>;
}

export declare class RedisModule {
  static forRoot(options: RedisModuleOptions): DynamicModule;
  static forRootAsync(options: RedisModuleAsyncOptions): DynamicModule;
}

export declare const REDIS_CLIENT: symbol;
export declare const REDIS_MODULE_OPTIONS: symbol;
export declare const TOKEN_BLACKLIST_NAMESPACE: string;
export declare function tokenBlacklistKey(jti: string): string;
