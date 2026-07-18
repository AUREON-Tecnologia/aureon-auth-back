import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { USER_TOKEN_REPOSITORY } from './domain/repositories/user-token.repository.interface';
import { SupabaseUserTokenRepository } from './infrastructure/repositories/supabase-user-token.repository';
import { UserTokenService } from './application/services/user-token.service';
import { PasswordResetController } from './presentation/controllers/password-reset.controller';
import { SelfServiceController } from './presentation/controllers/self-service.controller';

@Module({
  imports: [AuthModule],
  controllers: [PasswordResetController, SelfServiceController],
  providers: [{ provide: USER_TOKEN_REPOSITORY, useClass: SupabaseUserTokenRepository }, UserTokenService],
})
export class SelfServiceTokensModule {}
