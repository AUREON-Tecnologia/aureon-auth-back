'use strict';

const { Module } = require('@nestjs/common');

const REDIS_CLIENT = Symbol('REDIS_CLIENT');
const REDIS_MODULE_OPTIONS = Symbol('REDIS_MODULE_OPTIONS');
const TOKEN_BLACKLIST_NAMESPACE = 'identity:token-blacklist';

function tokenBlacklistKey(jti) {
  return `${TOKEN_BLACKLIST_NAMESPACE}:${jti}`;
}

/**
 * STUB TEMPORAL de @aureon/redis-client — ver README.md de esta carpeta.
 * No conecta a Redis de verdad: se comporta exactamente como el modo
 * fail-open ya soportado por el diseño real cuando Redis no responde (ver
 * azure/aureon-redis-client/CLAUDE.md), asi que no cambia la correctitud de
 * nada — solo se pierde la revocacion anticipada de logout mientras esta
 * congelado.
 */
class TokenBlacklistWriterService {
  async revoke(_jti, _ttlSegundos) {
    // no-op
  }
}

class TokenBlacklistReaderService {
  async isRevoked(_jti) {
    return false;
  }
}

class RedisService {
  async get(_key) {
    return null;
  }

  async set(_key, _value, _ttlSegundos) {
    // no-op
  }

  async del(_key) {
    // no-op
  }

  async exists(_key) {
    return false;
  }

  getClient() {
    throw new Error(
      '@aureon/redis-client esta congelado (stub) — RedisService.getClient() no esta disponible. Ver libs/redis-client-stub/README.md',
    );
  }
}

function buildDynamicModule(optionsProvider, imports, isGlobal) {
  return {
    module: RedisModule,
    global: !!isGlobal,
    imports: imports || [],
    providers: [optionsProvider, RedisService, TokenBlacklistWriterService, TokenBlacklistReaderService],
    exports: [RedisService, TokenBlacklistWriterService, TokenBlacklistReaderService],
  };
}

class RedisModule {
  static forRoot(options) {
    return buildDynamicModule({ provide: REDIS_MODULE_OPTIONS, useValue: options || {} }, [], options && options.isGlobal);
  }

  static forRootAsync(options) {
    return buildDynamicModule(
      {
        provide: REDIS_MODULE_OPTIONS,
        useFactory: options.useFactory,
        inject: options.inject || [],
      },
      options.imports || [],
      options.isGlobal,
    );
  }
}
Module({})(RedisModule);

module.exports = {
  RedisModule,
  RedisService,
  TokenBlacklistWriterService,
  TokenBlacklistReaderService,
  REDIS_CLIENT,
  REDIS_MODULE_OPTIONS,
  TOKEN_BLACKLIST_NAMESPACE,
  tokenBlacklistKey,
};
