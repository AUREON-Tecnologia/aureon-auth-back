import { Injectable } from '@nestjs/common';
import { Tenant as TenantRow, Prisma } from '@prisma/client';
import { PrismaService } from '../../../../common/prisma/prisma.service';
import { Paginacion } from '../../../../common/domain/paginacion-meta';
import { CrearTenantData, ITenantRepository } from '../../domain/repositories/tenant.repository.interface';
import { Tenant } from '../../domain/entities/tenant.entity';

@Injectable()
export class PrismaTenantRepository implements ITenantRepository {
  constructor(private readonly prisma: PrismaService) {}

  async crear(data: CrearTenantData): Promise<Tenant> {
    const row = await this.prisma.tenant.create({
      data: {
        code: data.codigo,
        name: data.nombre,
        settings: (data.configuracion ?? {}) as Prisma.InputJsonValue,
      },
    });
    return this.toEntity(row);
  }

  async findByCode(codigo: string): Promise<Tenant | null> {
    const row = await this.prisma.tenant.findUnique({ where: { code: codigo } });
    return row ? this.toEntity(row) : null;
  }

  async findById(id: string): Promise<Tenant | null> {
    const row = await this.prisma.tenant.findUnique({ where: { id } });
    return row ? this.toEntity(row) : null;
  }

  async listar(paginacion: Paginacion): Promise<{ data: Tenant[]; total: number }> {
    const [rows, total] = await Promise.all([
      this.prisma.tenant.findMany({
        orderBy: { createdAt: 'desc' },
        skip: (paginacion.pagina - 1) * paginacion.tamanioPagina,
        take: paginacion.tamanioPagina,
      }),
      this.prisma.tenant.count(),
    ]);
    return { data: rows.map((r) => this.toEntity(r)), total };
  }

  private toEntity(row: TenantRow): Tenant {
    return new Tenant(
      row.id,
      row.code,
      row.name,
      row.isActive,
      row.settings as Record<string, unknown>,
      row.createdAt,
    );
  }
}
