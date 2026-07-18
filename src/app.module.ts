import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { appConfig, jwtConfig, supabaseConfig, securityConfig, validationSchema } from './config';
import { AuthModule } from './modules/auth/auth.module';
import { OtpModule } from './modules/otp/otp.module';
import { HealthController } from './modules/health/health.controller';
import { CommonModule } from './common/common.module';
import { SupabaseModule } from './common/supabase/supabase.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, jwtConfig, supabaseConfig, securityConfig],
      validationSchema,
      validationOptions: {
        abortEarly: false,
      },
    }),
    CommonModule,
    SupabaseModule,
    AuthModule,
    OtpModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
