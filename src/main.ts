import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  // cookie-parser MUST run before any guard that reads request.cookies
  // (JwtAuthGuard/CsrfGuard from @aureon/redis-client) — see its CLAUDE.md.
  app.use(cookieParser());

  app.enableCors({
    origin: configService.get<string>('cookie.frontendOrigin'),
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.useGlobalFilters(new GlobalExceptionFilter());

  const port = configService.get<number>('app.port') ?? 3001;
  await app.listen(port);

  logger.log(`auth-service escuchando en puerto ${port}`);
  logger.log(`Entorno: ${configService.get<string>('app.nodeEnv')}`);
}

void bootstrap();
