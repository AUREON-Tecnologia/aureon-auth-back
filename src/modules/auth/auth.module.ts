import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AUTH_REPOSITORY } from './domain/repositories/auth.repository.interface';
import { SESSION_REPOSITORY } from './domain/repositories/session.repository.interface';
import { SupabaseAuthRepository } from './infrastructure/repositories/supabase-auth.repository';
import { SupabaseSessionRepository } from './infrastructure/repositories/supabase-session.repository';
import { AuthCommandService } from './application/commands/auth-command.service';
import { AuthQueryService } from './application/queries/auth-query.service';
import { TokenService } from './application/services/token.service';
import { AuthController } from './presentation/controllers/auth.controller';
import { parseDurationToMs } from '../../common/utils/duration.util';

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
  controllers: [AuthController],
  providers: [
    { provide: AUTH_REPOSITORY, useClass: SupabaseAuthRepository },
    { provide: SESSION_REPOSITORY, useClass: SupabaseSessionRepository },
    TokenService,
    AuthCommandService,
    AuthQueryService,
  ],
  // Exportado para que TenantsModule (bootstrap del primer admin) y
  // SelfServiceTokensModule (verificacion de email / reset de password) lo usen.
  exports: [AUTH_REPOSITORY, SESSION_REPOSITORY],
})
export class AuthModule {}
