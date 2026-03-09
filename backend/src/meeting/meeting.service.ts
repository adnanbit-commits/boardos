import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { MeetingStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateMeetingDto } from './dto/create-meeting.dto';
import { UpdateMeetingDto } from './dto/update-meeting.dto';
import { AddAgendaItemDto } from './dto/add-agenda-item.dto';

// Valid forward transitions for the meeting workflow
const ALLOWED_TRANSITIONS: Record<MeetingStatus, MeetingStatus[]> = {
  DRAFT:         ['SCHEDULED'],
  SCHEDULED:     ['IN_PROGRESS', 'DRAFT'],
  IN_PROGRESS:   ['VOTING'],
  VOTING:        ['MINUTES_DRAFT'],
  MINUTES_DRAFT: ['SIGNED'],
  SIGNED:        ['LOCKED'],
  LOCKED:        [],
};

@Injectable()
export class MeetingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  findAll(companyId: string) {
    return this.prisma.meeting.findMany({
      where: { companyId },
      include: { agendaItems: { orderBy: { order: 'asc' } }, _count: { select: { resolutions: true } } },
      orderBy: { scheduledAt: 'desc' },
    });
  }

  async findOne(companyId: string, id: string) {
    const meeting = await this.prisma.meeting.findFirst({
      where: { id, companyId },
      include: {
        agendaItems: { orderBy: { order: 'asc' } },
        resolutions: { include: { votes: true } },
        minutes: true,
      },
    });
    if (!meeting) throw new NotFoundException('Meeting not found');
    return meeting;
  }

  async create(companyId: string, dto: CreateMeetingDto, userId: string) {
    const meeting = await this.prisma.meeting.create({
      data: { companyId, ...dto },
    });

    await this.audit.log({
      companyId, userId,
      action: 'MEETING_CREATED',
      entity: 'Meeting',
      entityId: meeting.id,
    });

    return meeting;
  }

  async update(companyId: string, id: string, dto: UpdateMeetingDto, userId: string) {
    await this.findOne(companyId, id); // ensure it exists and belongs to company
    return this.prisma.meeting.update({ where: { id }, data: dto });
  }

  async addAgendaItem(meetingId: string, dto: AddAgendaItemDto) {
    // Auto-increment order based on existing items
    const count = await this.prisma.agendaItem.count({ where: { meetingId } });
    return this.prisma.agendaItem.create({
      data: { meetingId, ...dto, order: count + 1 },
    });
  }

  async transition(companyId: string, id: string, targetStatus: string, userId: string) {
    const meeting = await this.findOne(companyId, id);
    const allowed = ALLOWED_TRANSITIONS[meeting.status];

    if (!allowed.includes(targetStatus as MeetingStatus)) {
      throw new BadRequestException(
        `Cannot transition from ${meeting.status} to ${targetStatus}`,
      );
    }

    // When closing voting → auto-finalize any resolutions still in VOTING
    // (handles case where not all directors voted before chairman closes)
    if (targetStatus === 'MINUTES_DRAFT') {
      const votingResolutions = await this.prisma.resolution.findMany({
        where: { meetingId: id, status: 'VOTING' },
        include: { votes: true },
      });

      for (const res of votingResolutions) {
        const directorCount = await this.prisma.companyUser.count({
          where: { companyId, role: { in: ['ADMIN', 'DIRECTOR'] } },
        });
        const approveCount = res.votes.filter(v => v.value === 'APPROVE').length;
        const finalStatus = approveCount > directorCount / 2 ? 'APPROVED' : 'REJECTED';
        await this.prisma.resolution.update({
          where: { id: res.id },
          data: { status: finalStatus as any },
        });
        await this.audit.log({
          companyId, userId,
          action: `RESOLUTION_${finalStatus}_AUTO`,
          entity: 'Resolution',
          entityId: res.id,
          metadata: { reason: 'voting_closed_by_chair', approveCount, directorCount },
        });
      }
    }

    const updated = await this.prisma.meeting.update({
      where: { id },
      data: { status: targetStatus as MeetingStatus },
    });

    await this.audit.log({
      companyId, userId,
      action: `MEETING_STATUS_${targetStatus}`,
      entity: 'Meeting',
      entityId: id,
      metadata: { from: meeting.status, to: targetStatus },
    });

    return updated;
  }
}
