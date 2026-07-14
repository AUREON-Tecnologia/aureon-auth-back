import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AUTH_REPOSITORY } from './domain/repositories/auth.repository.interface';
import { SupabaseAuthRepository } from './infrastructure/repositories/supabase-auth.repository';
import { AuthCommandService } from './application/commands/auth-command.service';
import { AuthQueryService } from './application/queries/auth-query.service';
import { TokenService } from './application/services/token.service';
import { AuthController } from './presentation/controllers/auth.controller';

@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const expiresIn = configService.get<string>('jwt.expiresIn') ?? '7d';
        return {
          secret: configService.get<string>('jwt.secret'),
          signOptions: {
            expiresIn: /^\d+$/.test(expiresIn) ? Number(expiresIn) : (expiresIn as `${number}${'s' | 'm' | 'h' | 'd'}`),
          },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [
    {
      provide: AUTH_REPOSITORY,
      useClass: SupabaseAuthRepository,
    },
    TokenService,
    AuthCommandService,
    AuthQueryService,
  ],
})
export class AuthModule {}