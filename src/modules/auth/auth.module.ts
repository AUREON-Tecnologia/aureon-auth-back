import { Module } from '@nestjs/common';
import { AUTH_REPOSITORY } from './domain/repositories/auth.repository.interface';
import { SESSION_REPOSITORY } from './domain/repositories/session.repository.interface';
import { PrismaAuthRepository } from './infrastructure/repositories/prisma-auth.repository';
import { PrismaSessionRepository } from './infrastructure/repositories/prisma-session.repository';
import { AuthCommandService } from './application/commands/auth-command.service';
import { AuthQueryService } from './application/queries/auth-query.service';
import { TokenService } from './application/services/token.service';
import { AuthController } from './presentation/controllers/auth.controller';

@Module({
  controllers: [AuthController],
  providers: [
    { provide: AUTH_REPOSITORY, useClass: PrismaAuthRepository },
    { provide: SESSION_REPOSITORY, useClass: PrismaSessionRepository },
    TokenService,
    AuthCommandService,
    AuthQueryService,
  ],
  // Exportado para que TenantsModule (bootstrap del primer admin) y
  // SelfServiceTokensModule (verificacion de email / reset de password / hash de tokens) lo usen.
  exports: [AUTH_REPOSITORY, SESSION_REPOSITORY, TokenService],
})
export class AuthModule {}
