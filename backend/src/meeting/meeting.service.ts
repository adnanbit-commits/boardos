import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { MeetingStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateMeetingDto } from './dto/create-meeting.dto';
import { UpdateMeetingDto } from './dto/update-meeting.dto';
import { AddAgendaItemDto } from './dto/add-agenda-item.dto';

const ALLOWED_TRANSITIONS: Record<MeetingStatus, MeetingStatus[]> = {
  DRAFT:              ['SCHEDULED'],
  SCHEDULED:          ['IN_PROGRESS', 'DRAFT'],
  IN_PROGRESS:        ['VOTING'],
  VOTING:             ['MINUTES_DRAFT'],
  MINUTES_DRAFT:      ['MINUTES_CIRCULATED'],
  MINUTES_CIRCULATED: ['SIGNED'],
  SIGNED:             ['LOCKED'],
  LOCKED:             [],
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
        declarations: {
          include: { user: { select: { id: true, name: true, email: true } } },
        },
      },
    });
    if (!meeting) throw new NotFoundException('Meeting not found');
    return meeting;
  }

  async create(companyId: string, dto: CreateMeetingDto, userId: string) {
    const meeting = await this.prisma.meeting.create({ data: { companyId, ...dto } });
    await this.audit.log({ companyId, userId, action: 'MEETING_CREATED', entity: 'Meeting', entityId: meeting.id });
    return meeting;
  }

  async update(companyId: string, id: string, dto: UpdateMeetingDto, userId: string) {
    await this.findOne(companyId, id);
    return this.prisma.meeting.update({ where: { id }, data: dto });
  }

  async addAgendaItem(companyId: string, meetingId: string, dto: AddAgendaItemDto) {
    const meeting = await this.prisma.meeting.findFirst({ where: { id: meetingId, companyId } });
    if (!meeting) throw new NotFoundException('Meeting not found');
    const count = await this.prisma.agendaItem.count({ where: { meetingId } });
    const isAob = ['IN_PROGRESS', 'VOTING'].includes(meeting.status);
    return this.prisma.agendaItem.create({ data: { meetingId, ...dto, order: count + 1, isAob } });
  }

  // ── Chairperson ──────────────────────────────────────────────────────────────

  async electChairperson(companyId: string, meetingId: string, chairpersonId: string, userId: string) {
    const meeting = await this.prisma.meeting.findFirst({ where: { id: meetingId, companyId } });
    if (!meeting) throw new NotFoundException('Meeting not found');
    if (['SIGNED', 'LOCKED'].includes(meeting.status))
      throw new BadRequestException('Cannot change chairperson on a signed meeting');

    const membership = await this.prisma.companyUser.findFirst({
      where: { companyId, userId: chairpersonId, role: { in: ['ADMIN', 'DIRECTOR'] } },
    });
    if (!membership) throw new BadRequestException('Nominated chairperson must be a Director or Admin');

    const updated = await this.prisma.meeting.update({ where: { id: meetingId }, data: { chairpersonId } });
    await this.audit.log({ companyId, userId, action: 'MEETING_CHAIRPERSON_ELECTED', entity: 'Meeting', entityId: meetingId, metadata: { chairpersonId } });
    return updated;
  }

  async setMinutesRecorder(companyId: string, meetingId: string, recorderId: string, userId: string) {
    const meeting = await this.prisma.meeting.findFirst({ where: { id: meetingId, companyId } });
    if (!meeting) throw new NotFoundException('Meeting not found');
    if (['SIGNED', 'LOCKED'].includes(meeting.status))
      throw new BadRequestException('Cannot change recorder on a signed meeting');

    const membership = await this.prisma.companyUser.findFirst({
      where: { companyId, userId: recorderId, role: { in: ['ADMIN', 'DIRECTOR'] } },
    });
    if (!membership) throw new BadRequestException('Recorder must be a Director or Admin');

    const updated = await this.prisma.meeting.update({ where: { id: meetingId }, data: { minutesRecorderId: recorderId } });
    await this.audit.log({ companyId, userId, action: 'MEETING_RECORDER_DESIGNATED', entity: 'Meeting', entityId: meetingId, metadata: { recorderId } });
    return updated;
  }

  // ── Declarations ──────────────────────────────────────────────────────────────

  async getDeclarations(companyId: string, meetingId: string) {
    await this.findOne(companyId, meetingId);
    const members = await this.prisma.companyUser.findMany({
      where: { companyId, role: { in: ['ADMIN', 'DIRECTOR'] }, acceptedAt: { not: null } },
      include: { user: { select: { id: true, name: true, email: true } } },
    });
    const declarations = await this.prisma.directorDeclaration.findMany({ where: { meetingId } });
    const declMap = new Map(declarations.map(d => [`${d.userId}:${d.formType}`, d]));
    const FORMS = ['DIR_2', 'DIR_8', 'MBP_1'] as const;

    return members.map(m => ({
      userId: m.user.id, name: m.user.name, email: m.user.email,
      role: m.role, isChairman: m.isChairman,
      forms: FORMS.map(form => {
        const rec = declMap.get(`${m.user.id}:${form}`);
        return { formType: form, received: rec?.received ?? false, notes: rec?.notes ?? null, recordedAt: rec?.recordedAt ?? null };
      }),
    }));
  }

  async recordDeclaration(
    companyId: string, meetingId: string,
    body: { userId: string; formType: 'DIR_2' | 'DIR_8' | 'MBP_1'; received: boolean; notes?: string },
    actorId: string,
  ) {
    await this.findOne(companyId, meetingId);
    const declaration = await this.prisma.directorDeclaration.upsert({
      where: { meetingId_userId_formType: { meetingId, userId: body.userId, formType: body.formType as any } },
      create: { meetingId, userId: body.userId, formType: body.formType as any, received: body.received, notes: body.notes },
      update: { received: body.received, notes: body.notes, recordedAt: new Date() },
    });
    await this.audit.log({ companyId, userId: actorId, action: 'DECLARATION_RECORDED', entity: 'Meeting', entityId: meetingId, metadata: { targetUserId: body.userId, formType: body.formType, received: body.received } });
    return declaration;
  }

  // ── Transition ──────────────────────────────────────────────────────────────

  async transition(companyId: string, id: string, targetStatus: string, userId: string) {
    const meeting = await this.findOne(companyId, id);
    const allowed = ALLOWED_TRANSITIONS[meeting.status];

    if (!allowed.includes(targetStatus as MeetingStatus)) {
      throw new BadRequestException(`Cannot transition from ${meeting.status} to ${targetStatus}`);
    }

    // Chairperson must be elected before meeting starts
    if (targetStatus === 'IN_PROGRESS' && !(meeting as any).chairpersonId) {
      throw new BadRequestException(
        'A chairperson must be elected before the meeting can be opened. Use POST /meetings/:id/chairperson first.',
      );
    }

    // Auto-finalize VOTING resolutions when closing voting
    if (targetStatus === 'MINUTES_DRAFT') {
      const votingResolutions = await this.prisma.resolution.findMany({
        where: { meetingId: id, status: 'VOTING' },
        include: { votes: true },
      });
      for (const res of votingResolutions) {
        const directorCount = await this.prisma.companyUser.count({ where: { companyId, role: { in: ['ADMIN', 'DIRECTOR'] } } });
        const approveCount = res.votes.filter(v => v.value === 'APPROVE').length;
        const finalStatus = approveCount > directorCount / 2 ? 'APPROVED' : 'REJECTED';
        await this.prisma.resolution.update({ where: { id: res.id }, data: { status: finalStatus as any } });
        await this.audit.log({ companyId, userId, action: `RESOLUTION_${finalStatus}_AUTO`, entity: 'Resolution', entityId: res.id, metadata: { approveCount, directorCount } });
      }
    }

    const extraData: any = {};
    if (targetStatus === 'MINUTES_CIRCULATED') extraData.minutesCirculatedAt = new Date();

    const updated = await this.prisma.meeting.update({
      where: { id },
      data: { status: targetStatus as MeetingStatus, ...extraData },
    });

    await this.audit.log({ companyId, userId, action: `MEETING_STATUS_${targetStatus}`, entity: 'Meeting', entityId: id, metadata: { from: meeting.status, to: targetStatus } });
    return updated;
  }

  // ── Attendance ──────────────────────────────────────────────────────────────

  async getAttendance(companyId: string, meetingId: string) {
    await this.findOne(companyId, meetingId);
    const members = await this.prisma.companyUser.findMany({
      where: { companyId, role: { in: ['ADMIN', 'DIRECTOR'] }, acceptedAt: { not: null } },
      include: { user: { select: { id: true, name: true, email: true } } },
    });
    const records = await this.prisma.meetingAttendance.findMany({ where: { meetingId } });
    const recordMap = new Map(records.map(r => [r.userId, r]));
    return members.map(m => ({
      userId: m.user.id, name: m.user.name, email: m.user.email,
      role: m.role, isChairman: m.isChairman,
      attendance: recordMap.get(m.user.id) ?? null,
    }));
  }

  async recordAttendance(companyId: string, meetingId: string, userId: string, targetUserId: string, mode: string) {
    await this.findOne(companyId, meetingId);
    const record = await this.prisma.meetingAttendance.upsert({
      where:  { meetingId_userId: { meetingId, userId: targetUserId } },
      create: { meetingId, userId: targetUserId, mode: mode as any },
      update: { mode: mode as any, recordedAt: new Date() },
    });
    await this.audit.log({ companyId, userId, action: 'ATTENDANCE_RECORDED', entity: 'Meeting', entityId: meetingId, metadata: { targetUserId, mode } });
    return record;
  }
}
