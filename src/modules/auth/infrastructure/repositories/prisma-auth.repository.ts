import { Injectable } from '@nestjs/common';
import { User as UserRow } from '@prisma/client';
import { PrismaService } from '../../../../common/prisma/prisma.service';
import {
  CreateUsuarioData,
  IAuthRepository,
  UpdateUsuarioData,
  UsuarioWithPassword,
} from '../../domain/repositories/auth.repository.interface';
import { Usuario } from '../../domain/entities/usuario.entity';

@Injectable()
export class PrismaAuthRepository implements IAuthRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<Usuario | null> {
    const row = await this.prisma.user.findUnique({ where: { id } });
    return row ? this.toEntity(row) : null;
  }

  async findByEmail(email: string): Promise<Usuario | null> {
    const row = await this.prisma.user.findUnique({ where: { email } });
    return row ? this.toEntity(row) : null;
  }

  async findByEmailWithPassword(email: string): Promise<UsuarioWithPassword | null> {
    const row = await this.prisma.user.findUnique({ where: { email } });
    return row ? this.toEntityWithPassword(row) : null;
  }

  async create(input: CreateUsuarioData): Promise<Usuario> {
    const row = await this.prisma.user.create({
      data: {
        email: input.email,
        passwordHash: input.passwordHash,
        firstName: input.primerNombre ?? null,
        lastName: input.apellido ?? null,
      },
    });
    return this.toEntity(row);
  }

  async update(id: string, data: UpdateUsuarioData): Promise<Usuario> {
    const row = await this.prisma.user.update({
      where: { id },
      data: {
        ...(data.primerNombre !== undefined ? { firstName: data.primerNombre } : {}),
        ...(data.apellido !== undefined ? { lastName: data.apellido } : {}),
      },
    });
    return this.toEntity(row);
  }

  async registrarLoginExitoso(id: string): Promise<void> {
    await this.prisma.user.update({
      where: { id },
      data: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
    });
  }

  async registrarIntentoFallido(
    id: string,
    intentosFallidos: number,
    bloqueadoHasta: Date | null,
  ): Promise<void> {
    await this.prisma.user.update({
      where: { id },
      data: { failedLoginAttempts: intentosFallidos, lockedUntil: bloqueadoHasta },
    });
  }

  async marcarEmailVerificado(id: string): Promise<void> {
    await this.prisma.user.update({ where: { id }, data: { emailVerifiedAt: new Date() } });
  }

  async actualizarPassword(id: string, passwordHash: string): Promise<void> {
    await this.prisma.user.update({ where: { id }, data: { passwordHash } });
  }

  async setPlatformAdmin(id: string, valor: boolean): Promise<Usuario> {
    const row = await this.prisma.user.update({ where: { id }, data: { isPlatformAdmin: valor } });
    return this.toEntity(row);
  }

  async listarAdministradoresPlataforma(): Promise<Usuario[]> {
    const rows = await this.prisma.user.findMany({ where: { isPlatformAdmin: true } });
    return rows.map((row) => this.toEntity(row));
  }

  private toEntity(row: UserRow): Usuario {
    return new Usuario(
      row.id,
      row.email,
      row.firstName,
      row.lastName,
      row.emailVerifiedAt,
      row.isActive,
      row.deletedAt,
      row.failedLoginAttempts,
      row.lockedUntil,
      row.lastLoginAt,
      row.createdAt,
      row.isPlatformAdmin,
    );
  }

  private toEntityWithPassword(row: UserRow): UsuarioWithPassword {
    const base = this.toEntity(row);
    return Object.assign(Object.create(base), base, { passwordHash: row.passwordHash });
  }
}
