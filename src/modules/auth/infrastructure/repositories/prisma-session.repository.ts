import { Injectable } from '@nestjs/common';
import { UserSession as SesionRow } from '@prisma/client';
import { PrismaService } from '../../../../common/prisma/prisma.service';
import { CreateSesionData, ISessionRepository } from '../../domain/repositories/session.repository.interface';
import { Sesion } from '../../domain/entities/sesion.entity';

@Injectable()
export class PrismaSessionRepository implements ISessionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateSesionData): Promise<Sesion> {
    const row = await this.prisma.userSession.create({
      data: {
        userId: data.userId,
        tenantId: data.tenantId,
        refreshTokenHash: data.tokenHash,
        expiresAt: data.expiraEn,
        userAgent: data.userAgent ?? null,
        ipAddress: data.ipAddress ?? null,
      },
    });
    return this.toEntity(row);
  }

  async findByTokenHash(tokenHash: string): Promise<Sesion | null> {
    const row = await this.prisma.userSession.findUnique({ where: { refreshTokenHash: tokenHash } });
    return row ? this.toEntity(row) : null;
  }

  async invalidate(id: string): Promise<void> {
    await this.prisma.userSession.update({ where: { id }, data: { revokedAt: new Date() } });
  }

  async invalidateAllForUser(userId: string): Promise<void> {
    await this.prisma.userSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private toEntity(row: SesionRow): Sesion {
    return new Sesion(
      row.id,
      row.userId,
      row.tenantId,
      row.expiresAt,
      row.revokedAt,
      row.userAgent,
      row.ipAddress,
      row.createdAt,
    );
  }
}
