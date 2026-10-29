import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateContainerListDto, UpdateContainerListDto } from './dto/container-list.dto';

@Injectable()
export class ContainerListsService {
  private readonly logger = new Logger(ContainerListsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Save a reviewed container list and all its rows to the database.
   */
  async create(dto: CreateContainerListDto, createdById?: string) {
    this.logger.log(`Saving container list for site ${dto.site} with ${dto.rows?.length || 0} rows...`);

    const list = await this.prisma.containerList.create({
      data: {
        site: dto.site,
        title: dto.title || `Containerliste - ${dto.site}`,
        date: dto.date ? new Date(dto.date) : new Date(),
        rawFileName: dto.rawFileName,
        status: dto.status || 'SAVED',
        notes: dto.notes,
        createdById: createdById || null,
        rows: {
          create: (dto.rows || []).map((r, index) => ({
            rowOrder: r.rowOrder ?? index,
            date: r.date,
            containerNumber: r.containerNumber,
            fuss: r.fuss,
            artikel: r.artikel,
            kartons: r.kartons,
            termin: r.termin,
            ankunft: r.ankunft,
            start: r.start,
            ende: r.ende,
            personal: r.personal,
            wartezeitVon: r.wartezeitVon,
            wartezeitBis: r.wartezeitBis,
            wartezeitStd: r.wartezeitStd,
            wickel: r.wickel,
            preis: r.preis,
            ps: r.ps,
            extraTeam: r.extraTeam,
            bemerkung: r.bemerkung,
            warnings: r.warnings ? JSON.stringify(r.warnings) : undefined,
            uncertainFields: r.uncertainFields ? JSON.stringify(r.uncertainFields) : undefined,
          })),
        },
      },
      include: {
        rows: {
          orderBy: { rowOrder: 'asc' },
        },
        createdBy: {
          select: { id: true, name: true, username: true },
        },
      },
    });

    return list;
  }

  /**
   * List all saved container lists with pagination and optional site filter.
   */
  async findAll(page: number = 1, limit: number = 10, site?: string) {
    const skip = (page - 1) * limit;
    const where: any = {};
    if (site) where.site = site;

    const [total, items] = await Promise.all([
      this.prisma.containerList.count({ where }),
      this.prisma.containerList.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          _count: { select: { rows: true } },
          createdBy: { select: { id: true, name: true, username: true } },
        },
      }),
    ]);

    return {
      items,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Find single container list by ID with all rows.
   */
  async findOne(id: string) {
    const list = await this.prisma.containerList.findUnique({
      where: { id },
      include: {
        rows: {
          orderBy: { rowOrder: 'asc' },
        },
        createdBy: {
          select: { id: true, name: true, username: true },
        },
      },
    });

    if (!list) {
      throw new NotFoundException(`ContainerList with ID ${id} not found`);
    }

    return list;
  }

  /**
   * Update a container list and its rows.
   */
  async update(id: string, dto: UpdateContainerListDto) {
    await this.findOne(id); // Ensure exists

    return this.prisma.$transaction(async (tx) => {
      // 1. Update parent
      const updateData: any = {};
      if (dto.site !== undefined) updateData.site = dto.site;
      if (dto.title !== undefined) updateData.title = dto.title;
      if (dto.date !== undefined) updateData.date = dto.date ? new Date(dto.date) : null;
      if (dto.status !== undefined) updateData.status = dto.status;
      if (dto.notes !== undefined) updateData.notes = dto.notes;

      // 2. If rows are provided, replace them
      if (dto.rows && Array.isArray(dto.rows)) {
        await tx.containerListRow.deleteMany({
          where: { containerListId: id },
        });

        await tx.containerListRow.createMany({
          data: dto.rows.map((r, index) => ({
            containerListId: id,
            rowOrder: r.rowOrder ?? index,
            date: r.date,
            containerNumber: r.containerNumber,
            fuss: r.fuss,
            artikel: r.artikel,
            kartons: r.kartons,
            termin: r.termin,
            ankunft: r.ankunft,
            start: r.start,
            ende: r.ende,
            personal: r.personal,
            wartezeitVon: r.wartezeitVon,
            wartezeitBis: r.wartezeitBis,
            wartezeitStd: r.wartezeitStd,
            wickel: r.wickel,
            preis: r.preis,
            ps: r.ps,
            extraTeam: r.extraTeam,
            bemerkung: r.bemerkung,
            warnings: r.warnings ? JSON.stringify(r.warnings) : undefined,
            uncertainFields: r.uncertainFields ? JSON.stringify(r.uncertainFields) : undefined,
          })),
        });
      }

      return tx.containerList.update({
        where: { id },
        data: updateData,
        include: {
          rows: { orderBy: { rowOrder: 'asc' } },
          createdBy: { select: { id: true, name: true, username: true } },
        },
      });
    });
  }

  /**
   * Delete a container list.
   */
  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.containerList.delete({
      where: { id },
    });
  }
}
