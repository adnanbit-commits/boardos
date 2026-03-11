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

  async remove(companyId: string, id: string, userId: string) {
    const meeting = await this.prisma.meeting.findFirst({ where: { id, companyId } });
    if (!meeting) throw new NotFoundException('Meeting not found');
    if (meeting.status !== 'DRAFT')
      throw new BadRequestException('Only DRAFT meetings can be deleted');

    await this.prisma.meeting.delete({ where: { id } });

    await this.audit.log({
      companyId, userId,
      action: 'MEETING_DELETED',
      entity: 'Meeting',
      entityId: id,
      metadata: { title: meeting.title },
    });

    return { message: 'Meeting deleted' };
  }

  // ── Attendance ─────────────────────────────────────────────────────────────

  async getAttendance(companyId: string, meetingId: string) {
    await this.findOne(companyId, meetingId); // ownership check

    // Return all directors in company alongside their attendance record if any
    const members = await this.prisma.companyUser.findMany({
      where:   { companyId, role: { in: ['ADMIN', 'DIRECTOR'] }, acceptedAt: { not: null } },
      include: { user: { select: { id: true, name: true, email: true } } },
    });

    const records = await this.prisma.meetingAttendance.findMany({
      where: { meetingId },
    });

    const recordMap = new Map(records.map(r => [r.userId, r]));

    return members.map(m => ({
      userId:     m.user.id,
      name:       m.user.name,
      email:      m.user.email,
      role:       m.role,
      isChairman: m.isChairman,
      attendance: recordMap.get(m.user.id) ?? null,
    }));
  }

  async recordAttendance(
    companyId: string,
    meetingId: string,
    userId: string,
    targetUserId: string,
    mode: string,
  ) {
    await this.findOne(companyId, meetingId); // ownership check

    const record = await this.prisma.meetingAttendance.upsert({
      where:  { meetingId_userId: { meetingId, userId: targetUserId } },
      create: { meetingId, userId: targetUserId, mode: mode as any },
      update: { mode: mode as any, recordedAt: new Date() },
    });

    await this.audit.log({
      companyId, userId,
      action:   'ATTENDANCE_RECORDED',
      entity:   'Meeting',
      entityId: meetingId,
      metadata: { targetUserId, mode },
    });

    return record;
  }
}
