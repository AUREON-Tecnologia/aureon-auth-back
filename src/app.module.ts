import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { appConfig, jwtConfig, securityConfig, platformConfig, redisConfig, validationSchema } from './config';
import { AuthModule } from './modules/auth/auth.module';
import { RbacModule } from './modules/rbac/rbac.module';
import { TenantsModule } from './modules/tenants/tenants.module';
import { SelfServiceTokensModule } from './modules/self-service-tokens/self-service-tokens.module';
import { HealthController } from './modules/health/health.controller';
import { CommonModule } from './common/common.module';
import { PrismaModule } from './common/prisma/prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, jwtConfig, securityConfig, platformConfig, redisConfig],
      validationSchema,
      validationOptions: {
        abortEarly: false,
      },
    }),
    CommonModule,
    PrismaModule,
    RbacModule,
    TenantsModule,
    AuthModule,
    SelfServiceTokensModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
