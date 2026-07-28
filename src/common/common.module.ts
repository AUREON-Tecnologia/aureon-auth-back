import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuditLogService } from './services/audit-log.service';
import { parseDurationToMs } from './utils/duration.util';

/**
 * Global: registra JwtModule una sola vez para que JwtService este disponible
 * en cualquier modulo que use JwtAuthGuard (auth, rbac, self-service-tokens...)
 * sin que cada uno tenga que volver a registrarlo.
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
  ],
  providers: [AuditLogService],
  exports: [AuditLogService, JwtModule],
})
export class CommonModule {}
