import { Injectable } from '@nestjs/common';
import { UserCode as UserCodeRow } from '@prisma/client';
import { PrismaService } from '../../../../common/prisma/prisma.service';
import {
  CrearUserTokenData,
  IUserTokenRepository,
} from '../../domain/repositories/user-token.repository.interface';
import { TipoUserToken, UserToken } from '../../domain/entities/user-token.entity';

/** Tabla real: `user_codes` (antes `user_tokens` en scripts-v3) — columna `code_hash` en vez de `token_hash`. */
@Injectable()
export class PrismaUserTokenRepository implements IUserTokenRepository {
  constructor(private readonly prisma: PrismaService) {}

  async crear(data: CrearUserTokenData): Promise<UserToken> {
    const row = await this.prisma.userCode.create({
      data: {
        userId: data.userId,
        type: data.tipo,
        codeHash: data.tokenHash,
        expiresAt: data.expiraEn,
      },
    });
    return this.toEntity(row);
  }

  async buscarVigentePorHash(tokenHash: string, tipo: TipoUserToken): Promise<UserToken | null> {
    const row = await this.prisma.userCode.findFirst({
      where: { codeHash: tokenHash, type: tipo, usedAt: null, expiresAt: { gt: new Date() } },
    });
    return row ? this.toEntity(row) : null;
  }

  async marcarUsado(id: string): Promise<void> {
    await this.prisma.userCode.update({ where: { id }, data: { usedAt: new Date() } });
  }

  private toEntity(row: UserCodeRow): UserToken {
    return new UserToken(
      row.id,
      row.userId,
      row.type as TipoUserToken,
      row.expiresAt,
      row.usedAt,
      row.createdAt,
    );
  }
}
