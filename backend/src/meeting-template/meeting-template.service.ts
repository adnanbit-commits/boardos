import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface AgendaItemDraft {
  title: string;
  description?: string;
  order: number;
}

export interface CreateTemplateDto {
  name: string;
  description?: string;
  category?: string;
  agendaItems: AgendaItemDraft[];
}

@Injectable()
export class MeetingTemplateService {
  constructor(private readonly prisma: PrismaService) {}

  // ── List templates for a company ─────────────────────────────────────────────
  async list(companyId: string) {
    return this.prisma.meetingTemplate.findMany({
      where: { companyId },
      orderBy: [{ usageCount: 'desc' }, { createdAt: 'desc' }],
    });
  }

  // ── Create a custom template ──────────────────────────────────────────────────
  async create(companyId: string, dto: CreateTemplateDto) {
    return this.prisma.meetingTemplate.create({
      data: {
        companyId,
        name: dto.name,
        description: dto.description ?? null,
        category: dto.category ?? 'BOARD',
        agendaItems: dto.agendaItems as any,
      },
    });
  }

  // ── Update a custom template ──────────────────────────────────────────────────
  async update(companyId: string, id: string, dto: Partial<CreateTemplateDto>) {
    const template = await this.prisma.meetingTemplate.findUnique({ where: { id } });
    if (!template) throw new NotFoundException('Template not found');
    if (template.companyId !== companyId) throw new ForbiddenException();

    return this.prisma.meetingTemplate.update({
      where: { id },
      data: {
        ...(dto.name        !== undefined && { name:        dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.category    !== undefined && { category:    dto.category }),
        ...(dto.agendaItems !== undefined && { agendaItems: dto.agendaItems as any }),
      },
    });
  }

  // ── Delete a custom template ──────────────────────────────────────────────────
  async remove(companyId: string, id: string) {
    const template = await this.prisma.meetingTemplate.findUnique({ where: { id } });
    if (!template) throw new NotFoundException('Template not found');
    if (template.companyId !== companyId) throw new ForbiddenException();
    await this.prisma.meetingTemplate.delete({ where: { id } });
  }

  // ── Increment usage counter when a template is used to create a meeting ───────
  async recordUsage(companyId: string, id: string) {
    const template = await this.prisma.meetingTemplate.findFirst({
      where: { id, companyId },
    });
    if (!template) return;
    await this.prisma.meetingTemplate.update({
      where: { id },
      data: { usageCount: { increment: 1 } },
    });
  }
}
