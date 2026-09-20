import { Module } from '@nestjs/common';
import { APP_GUARD, RouterModule } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { CsrfGuard } from '@aureon/redis-client';
import {
  appConfig,
  jwtConfig,
  securityConfig,
  platformConfig,
  redisConfig,
  cookieConfig,
  validationSchema,
} from './config';
import { AuthModule } from './modules/auth/auth.module';
import { RbacModule } from './modules/rbac/rbac.module';
import { TenantsModule } from './modules/tenants/tenants.module';
import { PlatformModule } from './modules/platform/platform.module';
import { SelfServiceTokensModule } from './modules/self-service-tokens/self-service-tokens.module';
import { HealthController } from './modules/health/health.controller';
import { CommonModule } from './common/common.module';
import { PrismaModule } from './common/prisma/prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, jwtConfig, securityConfig, platformConfig, redisConfig, cookieConfig],
      validationSchema,
      validationOptions: {
        abortEarly: false,
      },
    }),
    CommonModule,
    PrismaModule,
    AuthModule,
    SelfServiceTokensModule,
    // Módulos con prefijo /auth en el gateway — los controllers no cambian
    RbacModule,
    TenantsModule,
    PlatformModule,
    RouterModule.register([
      {
        path: 'auth',
        children: [RbacModule, TenantsModule, PlatformModule],
      },
    ]),
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: CsrfGuard }],
})
export class AppModule {}
