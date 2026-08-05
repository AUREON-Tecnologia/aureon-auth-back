import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { RedisModule } from '@aureon/redis-client';
import { AuditLogService } from './services/audit-log.service';
import { parseDurationToMs } from './utils/duration.util';

/**
 * Global: registra JwtModule y RedisModule una sola vez para que JwtService/
 * TokenBlacklistWriterService/TokenBlacklistReaderService esten disponibles
 * en cualquier modulo (auth, rbac, self-service-tokens...) sin que cada uno
 * tenga que volver a registrarlos.
 */
@Global()
@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const expiresIn = configService.get<string>('jwt.expiresIn') ?? '30m';
        return {
          secret: configService.get<string>('jwt.secret'),
          signOptions: { expiresIn: Math.floor(parseDurationToMs(expiresIn) / 1000) },
        };
      },
    }),
    RedisModule.forRootAsync({
      isGlobal: true,
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        host: configService.get<string>('redis.host')!,
        port: configService.get<number>('redis.port')!,
        password: configService.get<string>('redis.password'),
        db: configService.get<number>('redis.db'),
        keyPrefix: configService.get<string>('redis.keyPrefix')!,
      }),
    }),
  ],
  providers: [AuditLogService],
  exports: [AuditLogService, JwtModule, RedisModule],
})
export class CommonModule {}
