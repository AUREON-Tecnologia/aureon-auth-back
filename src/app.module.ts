import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import {
  appConfig,
  jwtConfig,
  supabaseConfig,
  securityConfig,
  platformConfig,
  validationSchema,
} from './config';
import { AuthModule } from './modules/auth/auth.module';
import { RbacModule } from './modules/rbac/rbac.module';
import { TenantsModule } from './modules/tenants/tenants.module';
import { SelfServiceTokensModule } from './modules/self-service-tokens/self-service-tokens.module';
import { HealthController } from './modules/health/health.controller';
import { CommonModule } from './common/common.module';
import { SupabaseModule } from './common/supabase/supabase.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, jwtConfig, supabaseConfig, securityConfig, platformConfig],
      validationSchema,
      validationOptions: {
        abortEarly: false,
      },
    }),
    CommonModule,
    SupabaseModule,
    RbacModule,
    TenantsModule,
    AuthModule,
    SelfServiceTokensModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
