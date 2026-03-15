import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { MeetingStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationService } from '../notification/notification.service';
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
    private readonly notificationService: NotificationService,
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

  async remove(companyId: string, id: string, userId: string) {
    const meeting = await this.prisma.meeting.findFirst({ where: { id, companyId } });
    if (!meeting) throw new NotFoundException('Meeting not found');
    if (!['DRAFT', 'SCHEDULED'].includes(meeting.status)) {
      throw new BadRequestException('Only DRAFT or SCHEDULED meetings can be deleted');
    }
    await this.prisma.agendaItem.deleteMany({ where: { meetingId: id } });
    await this.prisma.resolution.deleteMany({ where: { meetingId: id } });
    await this.prisma.meetingAttendance.deleteMany({ where: { meetingId: id } });
    await this.prisma.directorDeclaration.deleteMany({ where: { meetingId: id } });
    await this.prisma.meeting.delete({ where: { id } });
    await this.audit.log({ companyId, userId, action: 'MEETING_DELETED', entity: 'Meeting', entityId: id });
    return { message: 'Meeting deleted' };
  }

  async addAgendaItem(companyId: string, meetingId: string, dto: AddAgendaItemDto) {
    const meeting = await this.prisma.meeting.findFirst({ where: { id: meetingId, companyId } });
    if (!meeting) throw new NotFoundException('Meeting not found');
    const count = await this.prisma.agendaItem.count({ where: { meetingId } });
    const isAob = ['IN_PROGRESS', 'VOTING'].includes(meeting.status);
    return this.prisma.agendaItem.create({
      data: {
        meetingId,
        title:       dto.title,
        description: dto.description,
        order:       count + 1,
        isAob,
        // Typed item metadata from template application
        ...(dto.itemType    ? { itemType:    dto.itemType    } : {}),
        ...(dto.legalBasis  ? { legalBasis:  dto.legalBasis  } : {}),
        ...(dto.guidanceNote? { guidanceNote:dto.guidanceNote} : {}),
      } as any,
    });
  }

  // ── Chairperson ──────────────────────────────────────────────────────────────

  async electChairperson(companyId: string, meetingId: string, chairpersonId: string, userId: string) {
    const meeting = await this.prisma.meeting.findFirst({ where: { id: meetingId, companyId } });
    if (!meeting) throw new NotFoundException('Meeting not found');
    if (['SIGNED', 'LOCKED'].includes(meeting.status))
      throw new BadRequestException('Cannot change chairperson on a signed meeting');

    const membership = await this.prisma.companyUser.findFirst({
      where: { companyId, userId: chairpersonId, role: { in: ['DIRECTOR', 'COMPANY_SECRETARY'] } },
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
      where: { companyId, userId: recorderId, role: { in: ['DIRECTOR', 'COMPANY_SECRETARY'] } },
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
      where: { companyId, role: { in: ['DIRECTOR', 'COMPANY_SECRETARY'] }, acceptedAt: { not: null } },
      include: { user: { select: { id: true, name: true, email: true } } },
    });
    const declarations = await this.prisma.directorDeclaration.findMany({ where: { meetingId } });
    const declMap = new Map(declarations.map(d => [`${d.userId}:${d.formType}`, d]));
    const FORMS = ['DIR_2', 'DIR_8', 'MBP_1'] as const;

    return members.map(m => ({
      userId: m.user.id, name: m.user.name, email: m.user.email,
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

    // SCHEDULED → IN_PROGRESS gates:
    // 1. Chairperson must be elected first (restores the original working flow)
    // 2. At least one attendance record must exist (quorum check)
    if (targetStatus === 'IN_PROGRESS' && !(meeting as any).chairpersonId) {
      throw new BadRequestException(
        'A Chairperson must be elected before the meeting can be opened to business. ' +
        'Use the "Elect Chairperson" button to elect one first.',
      );
    }
    if (targetStatus === 'IN_PROGRESS') {
      const members = await this.prisma.companyUser.findMany({
        where: { companyId, role: { in: ['DIRECTOR', 'COMPANY_SECRETARY'] }, acceptedAt: { not: null } },
      });
      const attendanceCount = await this.prisma.meetingAttendance.count({
        where: { meetingId: id },
      });
      if (attendanceCount === 0) {
        throw new BadRequestException(
          'Attendance has not been recorded for any director. ' +
          'Please record attendance (roll call) before opening the meeting to business.',
        );
      }
      // Quorum check: max(2, ceil(n/3)) directors must be present (not ABSENT)
      const presentCount = await this.prisma.meetingAttendance.count({
        where: { meetingId: id, mode: { notIn: ['ABSENT', 'REQUESTED_VIDEO', 'REQUESTED_PHONE'] as any[] } },
      });
      const quorumRequired = Math.max(2, Math.ceil(members.length / 3));
      if (presentCount < quorumRequired) {
        throw new BadRequestException(
          `Quorum not met. ${presentCount} of ${members.length} directors present — ` +
          `minimum ${quorumRequired} required (Sec. 174 Companies Act 2013). ` +
          `The meeting cannot be opened without quorum.`,
        );
      }
    }

    // Auto-finalize VOTING resolutions when closing voting
    if (targetStatus === 'MINUTES_DRAFT') {
      const votingResolutions = await this.prisma.resolution.findMany({
        where: { meetingId: id, status: 'VOTING' },
        include: { votes: true },
      });
      for (const res of votingResolutions) {
        const directorCount = await this.prisma.companyUser.count({ where: { companyId, role: { in: ['DIRECTOR', 'COMPANY_SECRETARY'] } } });
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

    // ── Meeting scheduled — notify all directors and CS ────────────────────
    if (targetStatus === 'SCHEDULED') {
      const members = await this.prisma.companyUser.findMany({
        where: { companyId, role: { in: ['DIRECTOR', 'COMPANY_SECRETARY'] }, acceptedAt: { not: null } },
        include: { user: { select: { id: true, name: true, email: true } } },
      });
      const frontendUrl  = process.env.FRONTEND_URL ?? 'http://localhost:3000';
      const meetingUrl   = `${frontendUrl}/companies/${companyId}/meetings/${id}`;
      const meetingDate  = new Date((updated as any).scheduledAt)
        .toLocaleString('en-IN', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
      const deemedVenue  = (updated as any).deemedVenue ?? (updated as any).location ?? 'Deemed venue not specified';

      await Promise.all(members.map(m =>
        this.notificationService.send({
          userId:    m.user.id,
          toEmail:   m.user.email,
          companyId,
          type:      'MEETING_INVITE',
          subject:   `Board Meeting Scheduled — ${meeting.title}`,
          body: [
            `Dear ${m.user.name},`,
            '',
            `A Board Meeting has been scheduled. Please find the details below.`,
            '',
            `Meeting: ${meeting.title}`,
            `Date & Time: ${meetingDate}`,
            `Deemed Venue: ${deemedVenue}`,
            '',
            `Please acknowledge receipt of this notice by opening the meeting on BoardOS.`,
            '',
            `View meeting: ${meetingUrl}`,
            '',
            'BoardOS',
          ].join('\n'),
        }),
      ));
    }

    // ── Circulation emails ─────────────────────────────────────────────────
    // When draft minutes are circulated (SS-1 7-day comment window begins),
    // notify all directors and CS so they can review before the meeting is signed.
    if (targetStatus === 'MINUTES_CIRCULATED') {
      const [minutes, members] = await Promise.all([
        this.prisma.minutes.findUnique({ where: { meetingId: id } }),
        this.prisma.companyUser.findMany({
          where: { companyId, role: { in: ['DIRECTOR', 'COMPANY_SECRETARY'] }, acceptedAt: { not: null } },
          include: { user: { select: { id: true, name: true, email: true } } },
        }),
      ]);

      if (minutes) {
        const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:3000';
        const meetingUrl  = `${frontendUrl}/companies/${companyId}/meetings/${id}`;
        const deadline    = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
          .toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' });

        await Promise.all(members.map(m =>
          this.notificationService.send({
            userId:    m.user.id,
            toEmail:   m.user.email,
            companyId,
            type:      'MINUTES_READY',
            subject:   `Draft Minutes for Review — ${meeting.title}`,
            body: [
              `Dear ${m.user.name},`,
              '',
              `The draft minutes of the Board Meeting "${meeting.title}" have been circulated for your review.`,
              '',
              `Please review and raise any objections by ${deadline} (7 clear days as per SS-1).`,
              '',
              `Open minutes: ${meetingUrl}`,
              '',
              'If you have no objections, no action is needed.',
              '',
              'BoardOS',
            ].join('\n'),
          }),
        ));
      }
    }

    return updated;
  }

  // ── Attendance ──────────────────────────────────────────────────────────────

  async getAttendance(companyId: string, meetingId: string) {
    await this.findOne(companyId, meetingId);
    const members = await this.prisma.companyUser.findMany({
      where: { companyId, role: { in: ['DIRECTOR', 'COMPANY_SECRETARY'] }, acceptedAt: { not: null } },
      include: { user: { select: { id: true, name: true, email: true } } },
    });
    const records = await this.prisma.meetingAttendance.findMany({ where: { meetingId } });
    const recordMap = new Map(records.map(r => [r.userId, r]));
    return members.map(m => ({
      userId: m.user.id, name: m.user.name, email: m.user.email,
      attendance: recordMap.get(m.user.id) ?? null,
    }));
  }

  // ── SS-1 compliant attendance recording ──────────────────────────────────────
  //
  //  IN_PERSON  → director marks themselves only (equivalent to signing register)
  //  VIDEO/PHONE → authenticated by meeting chairperson or Company Secretary only
  //  ABSENT      → chairperson or CS only
  //  REQUESTED_* → use requestAttendance() below

  async recordAttendance(
    companyId: string,
    meetingId: string,
    requestingUserId: string,
    targetUserId: string,
    mode: string,
    location?: string,
    noThirdParty?: boolean,
  ) {
    const meeting = await this.prisma.meeting.findFirst({
      where: { id: meetingId, companyId },
    });
    if (!meeting) throw new NotFoundException('Meeting not found');

    if (!['SCHEDULED', 'IN_PROGRESS'].includes(meeting.status)) {
      throw new BadRequestException('Attendance can only be recorded for scheduled or in-progress meetings');
    }
    if (!meeting.chairpersonId) {
      throw new BadRequestException('A chairperson must be elected before attendance can be recorded');
    }

    const requester = await this.prisma.companyUser.findUnique({
      where: { userId_companyId: { userId: requestingUserId, companyId } },
    });
    if (!requester) throw new ForbiddenException('Not a member of this company');

    const isChairperson = meeting.chairpersonId === requestingUserId;
    const isCS = requester.role === 'COMPANY_SECRETARY';
    const canAuthElectronic = isChairperson || isCS;
    const isSelf = requestingUserId === targetUserId;

    if (mode === 'IN_PERSON') {
      // In-person: director must self-mark only
      if (!isSelf) {
        throw new ForbiddenException(
          'In-person attendance must be self-recorded. Each director signs their own attendance.',
        );
      }
    } else if (['VIDEO', 'PHONE', 'ABSENT'].includes(mode)) {
      // Electronic / absent: must be chairperson or CS (SS-1 Rule 3)
      if (!canAuthElectronic) {
        throw new ForbiddenException(
          'Electronic and absent attendance must be authenticated by the meeting chairperson or Company Secretary (SS-1).',
        );
      }
    } else {
      throw new BadRequestException(`Invalid attendance mode: ${mode}`);
    }

    const record = await this.prisma.meetingAttendance.upsert({
      where:  { meetingId_userId: { meetingId, userId: targetUserId } },
      create: {
        meetingId, userId: targetUserId, mode: mode as any,
        ...(location     !== undefined && { location }),
        ...(noThirdParty !== undefined && { noThirdParty }),
      },
      update: {
        mode: mode as any, recordedAt: new Date(),
        ...(location     !== undefined && { location }),
        ...(noThirdParty !== undefined && { noThirdParty }),
      },
    });

    await this.audit.log({
      companyId, userId: requestingUserId,
      action: 'ATTENDANCE_RECORDED', entity: 'Meeting', entityId: meetingId,
      metadata: { targetUserId, mode, authenticatedBy: isChairperson ? 'CHAIRPERSON' : isCS ? 'CS' : 'SELF' },
    });
    return record;
  }

  // Director requests electronic attendance — saves pending state, notifies chairperson + CS
  async requestAttendance(
    companyId: string,
    meetingId: string,
    requestingUserId: string,
    requestedMode: 'VIDEO' | 'PHONE',
  ) {
    const meeting = await this.prisma.meeting.findFirst({
      where: { id: meetingId, companyId },
      include: { company: { select: { name: true } } },
    });
    if (!meeting) throw new NotFoundException('Meeting not found');
    if (!['SCHEDULED', 'IN_PROGRESS'].includes(meeting.status)) {
      throw new BadRequestException('Cannot request attendance for this meeting status');
    }
    if (!meeting.chairpersonId) {
      throw new BadRequestException('No chairperson elected yet — cannot route request');
    }

    const requester = await this.prisma.companyUser.findUnique({
      where: { userId_companyId: { userId: requestingUserId, companyId } },
      include: { user: { select: { name: true } } },
    });
    if (!requester) throw new ForbiddenException('Not a member of this company');

    // Save pending mode
    const pendingMode = requestedMode === 'VIDEO' ? 'REQUESTED_VIDEO' : 'REQUESTED_PHONE';
    await this.prisma.meetingAttendance.upsert({
      where:  { meetingId_userId: { meetingId, userId: requestingUserId } },
      create: { meetingId, userId: requestingUserId, mode: pendingMode as any },
      update: { mode: pendingMode as any, recordedAt: new Date() },
    });

    // Notify chairperson + all CS members
    const toNotify = await this.prisma.companyUser.findMany({
      where: {
        companyId,
        OR: [
          { userId: meeting.chairpersonId },
          { role: 'COMPANY_SECRETARY' },
        ],
      },
      include: { user: { select: { id: true } } },
    });

    await Promise.all(toNotify.map(m =>
      this.notificationService.send({
        userId: m.user.id,
        companyId,
        type: 'GENERAL',
        subject: `Attendance request: ${requester.user.name}`,
        body: `${requester.user.name} has requested ${requestedMode.toLowerCase()} attendance for the meeting "${meeting.title}". Please confirm or reject their attendance in the meeting panel.`,
      }),
    ));

    await this.audit.log({
      companyId, userId: requestingUserId,
      action: 'ATTENDANCE_REQUESTED', entity: 'Meeting', entityId: meetingId,
      metadata: { requestedMode },
    });

    return { message: 'Attendance request sent to chairperson and Company Secretary' };
  }
  // ── Notice acknowledgement ────────────────────────────────────────────────────
  // Each director confirms receipt of notice and agenda before the meeting.
  // Satisfies SS-1 requirement that materials be received before participation.

  async acknowledgeNotice(companyId: string, meetingId: string, userId: string) {
    const meeting = await this.prisma.meeting.findFirst({ where: { id: meetingId, companyId } });
    if (!meeting) throw new NotFoundException('Meeting not found');
    if (!['DRAFT', 'SCHEDULED'].includes(meeting.status)) {
      throw new BadRequestException('Notice can only be acknowledged for draft or scheduled meetings');
    }

    const alreadyAck = (meeting as any).noticeAcknowledgedBy ?? [];
    if (alreadyAck.includes(userId)) {
      return { acknowledged: true, noticeAcknowledgedBy: alreadyAck };
    }

    const updated = await this.prisma.meeting.update({
      where: { id: meetingId },
      data: { noticeAcknowledgedBy: { push: userId } },
    });

    await this.audit.log({
      companyId, userId,
      action: 'NOTICE_ACKNOWLEDGED', entity: 'Meeting', entityId: meetingId,
    });

    return { acknowledged: true, noticeAcknowledgedBy: (updated as any).noticeAcknowledgedBy };
  }

  // ── Roll call ─────────────────────────────────────────────────────────────────
  // Each director responding to the roll call states their location and confirms:
  //   (a) their location, (b) no third party present, (c) materials received.
  // Required by SS-1 Rule 3(4) for video conferencing meetings.
  // When all present directors have responded, rollCallCompletedAt is set.

  async submitRollCall(
    companyId: string,
    meetingId: string,
    userId: string,
    body: { location: string; noThirdParty: boolean; materialsReceived: boolean },
  ) {
    const meeting = await this.prisma.meeting.findFirst({ where: { id: meetingId, companyId } });
    if (!meeting) throw new NotFoundException('Meeting not found');
    if (!['SCHEDULED', 'IN_PROGRESS'].includes(meeting.status)) {
      throw new BadRequestException('Roll call can only be submitted for scheduled or in-progress meetings');
    }

    // Upsert roll call response
    const rollCall = await (this.prisma as any).meetingRollCall.upsert({
      where: { meetingId_userId: { meetingId, userId } },
      create: { meetingId, userId, ...body, respondedAt: new Date() },
      update: { ...body, respondedAt: new Date() },
    });

    // Check if all present directors have responded
    const presentAttendance = await this.prisma.meetingAttendance.findMany({
      where: { meetingId, mode: { notIn: ['ABSENT', 'REQUESTED_VIDEO', 'REQUESTED_PHONE'] as any[] } },
    });
    const respondedIds = await (this.prisma as any).meetingRollCall.findMany({
      where: { meetingId },
      select: { userId: true },
    });
    const respondedSet = new Set(respondedIds.map((r: any) => r.userId));
    const allResponded = presentAttendance.every(a => respondedSet.has(a.userId));

    if (allResponded && !(meeting as any).rollCallCompletedAt) {
      await this.prisma.meeting.update({
        where: { id: meetingId },
        data: { rollCallCompletedAt: new Date() } as any,
      });
    }

    await this.audit.log({
      companyId, userId,
      action: 'ROLL_CALL_SUBMITTED', entity: 'Meeting', entityId: meetingId,
      metadata: { location: body.location, allResponded },
    });

    return { rollCall, allResponded };
  }

  async getRollCall(companyId: string, meetingId: string) {
    const meeting = await this.prisma.meeting.findFirst({ where: { id: meetingId, companyId } });
    if (!meeting) throw new NotFoundException('Meeting not found');

    const [responses, presentAttendance] = await Promise.all([
      (this.prisma as any).meetingRollCall.findMany({
        where: { meetingId },
        include: { user: { select: { id: true, name: true } } },
      }),
      this.prisma.meetingAttendance.findMany({
        where: { meetingId, mode: { notIn: ['ABSENT', 'REQUESTED_VIDEO', 'REQUESTED_PHONE'] as any[] } },
        include: { user: { select: { id: true, name: true } } },
      }),
    ]);

    const respondedSet = new Set(responses.map((r: any) => r.userId));
    const pendingDirectors = presentAttendance
      .filter(a => !respondedSet.has(a.userId))
      .map(a => ({ userId: a.userId, name: a.user.name }));

    return {
      responses,
      pendingDirectors,
      allResponded: pendingDirectors.length === 0,
      rollCallCompletedAt: (meeting as any).rollCallCompletedAt ?? null,
    };
  }

  // ── Quorum confirmation ───────────────────────────────────────────────────────
  // Chairperson formally confirms quorum on the record after roll call.
  // This is agenda item 2 in the guided flow.

  async confirmQuorum(companyId: string, meetingId: string, userId: string) {
    const meeting = await this.prisma.meeting.findFirst({ where: { id: meetingId, companyId } });
    if (!meeting) throw new NotFoundException('Meeting not found');
    if (!['SCHEDULED', 'IN_PROGRESS'].includes(meeting.status)) {
      throw new BadRequestException('Quorum can only be confirmed for open meetings');
    }
    if ((meeting as any).chairpersonId !== userId) {
      throw new ForbiddenException('Only the elected Chairperson can confirm quorum on the record');
    }

    const members = await this.prisma.companyUser.findMany({
      where: { companyId, role: { in: ['DIRECTOR', 'COMPANY_SECRETARY'] }, acceptedAt: { not: null } },
    });
    const presentCount = await this.prisma.meetingAttendance.count({
      where: { meetingId, mode: { notIn: ['ABSENT', 'REQUESTED_VIDEO', 'REQUESTED_PHONE'] as any[] } },
    });
    const quorumRequired = Math.max(2, Math.ceil(members.length / 3));

    if (presentCount < quorumRequired) {
      throw new BadRequestException(
        `Cannot confirm quorum: only ${presentCount} of ${members.length} directors present ` +
        `(minimum ${quorumRequired} required).`,
      );
    }

    const updated = await this.prisma.meeting.update({
      where: { id: meetingId },
      data: { quorumConfirmedAt: new Date(), quorumConfirmedBy: userId } as any,
    });

    await this.audit.log({
      companyId, userId,
      action: 'QUORUM_CONFIRMED', entity: 'Meeting', entityId: meetingId,
      metadata: { presentCount, totalMembers: members.length, quorumRequired },
    });

    return {
      confirmed: true,
      presentCount,
      totalMembers: members.length,
      quorumRequired,
      quorumConfirmedAt: (updated as any).quorumConfirmedAt,
    };
  }

  // ── Mark meeting as first board meeting ──────────────────────────────────────

  async markAsFirstMeeting(companyId: string, meetingId: string, userId: string) {
    const meeting = await this.prisma.meeting.findFirst({ where: { id: meetingId, companyId } });
    if (!meeting) throw new NotFoundException('Meeting not found');
    if (!['DRAFT', 'SCHEDULED'].includes(meeting.status)) {
      throw new BadRequestException('Can only mark a draft or scheduled meeting as the first meeting');
    }
    return this.prisma.meeting.update({
      where: { id: meetingId },
      data: { isFirstMeeting: true } as any,
    });
  }

}