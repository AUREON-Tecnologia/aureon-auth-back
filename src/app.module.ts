import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { appConfig, jwtConfig, supabaseConfig, validationSchema } from './config';
import { AuthModule } from './modules/auth/auth.module';
import { HealthController } from './modules/health/health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, jwtConfig, supabaseConfig],
      validationSchema,
      validationOptions: {
        abortEarly: false,
      },
    }),
    AuthModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}