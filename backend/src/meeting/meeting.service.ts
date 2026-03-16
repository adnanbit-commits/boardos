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
    const meeting = await this.prisma.meeting.create({
      data: { companyId, calledBy: userId, ...dto } as any,
    });
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

  // ── Chairperson nomination flow ──────────────────────────────────────────────
  //
  // Three persisted steps — all directors see the same state on page reload:
  //
  //   1. nominateChairperson  — any director proposes a nominee
  //   2. confirmChairperson   — other directors confirm (majority needed)
  //   3. electChairperson     — once majority confirmed, any director finalises
  //
  // The nomination state (chairNomineeId, chairNomineeProposedBy,
  // chairNomineeConfirmedBy) is stored on the Meeting row so every director's
  // browser shows the same pending nomination when they reload.

  async getNomination(companyId: string, meetingId: string) {
    const meeting = await this.prisma.meeting.findFirst({
      where: { id: meetingId, companyId },
      select: {
        id: true, chairpersonId: true, calledBy: true,
        chairNomineeId: true,
        chairNomineeProposedBy: true,
        chairNomineeConfirmedBy: true,
      },
    });
    if (!meeting) throw new NotFoundException('Meeting not found');

    const directors = await this.prisma.companyUser.findMany({
      where: { companyId, role: { in: ['DIRECTOR', 'COMPANY_SECRETARY'] }, acceptedAt: { not: null } },
      include: { user: { select: { id: true, name: true } } },
    });
    const totalDirectors  = directors.length;
    const majorityNeeded  = Math.max(1, Math.ceil(totalDirectors / 2));
    const confirmedBy     = (meeting as any).chairNomineeConfirmedBy ?? [];
    const confirmCount    = confirmedBy.length;

    return {
      chairpersonId:         meeting.chairpersonId,
      nomineeId:             (meeting as any).chairNomineeId    ?? null,
      proposedBy:            (meeting as any).chairNomineeProposedBy ?? null,
      confirmedBy,
      confirmCount,
      majorityNeeded,
      totalDirectors,
      isMajority:            confirmCount >= majorityNeeded,
      directors:             directors.map(d => ({ userId: d.user.id, name: d.user.name })),
    };
  }

  async nominateChairperson(companyId: string, meetingId: string, nomineeId: string, userId: string) {
    const meeting = await this.prisma.meeting.findFirst({ where: { id: meetingId, companyId } });
    if (!meeting) throw new NotFoundException('Meeting not found');
    if (['SIGNED', 'LOCKED'].includes(meeting.status))
      throw new BadRequestException('Cannot change chairperson on a signed or locked meeting');
    if (meeting.chairpersonId)
      throw new BadRequestException('A chairperson has already been elected for this meeting');

    // Validate nominee is a director/CS of this company
    const membership = await this.prisma.companyUser.findFirst({
      where: { companyId, userId: nomineeId, role: { in: ['DIRECTOR', 'COMPANY_SECRETARY'] }, acceptedAt: { not: null } },
    });
    if (!membership) throw new BadRequestException('Nominee must be a Director or Company Secretary of this company');

    // Clear any existing nomination and start fresh
    // The proposer auto-confirms their own nomination
    const updated = await this.prisma.meeting.update({
      where: { id: meetingId },
      data: {
        chairNomineeId:          nomineeId,
        chairNomineeProposedBy:  userId,
        chairNomineeConfirmedBy: [userId],  // proposer auto-confirms
      } as any,
    });

    await this.audit.log({
      companyId, userId,
      action: 'CHAIRPERSON_NOMINATED',
      entity: 'Meeting', entityId: meetingId,
      metadata: { nomineeId },
    });

    return this.getNomination(companyId, meetingId);
  }

  async confirmChairperson(companyId: string, meetingId: string, userId: string) {
    const meeting = await this.prisma.meeting.findFirst({ where: { id: meetingId, companyId } });
    if (!meeting) throw new NotFoundException('Meeting not found');
    if (!(meeting as any).chairNomineeId)
      throw new BadRequestException('No chairperson nomination is pending');
    if (meeting.chairpersonId)
      throw new BadRequestException('A chairperson has already been elected');

    const confirmedBy = (meeting as any).chairNomineeConfirmedBy ?? [];
    if (confirmedBy.includes(userId)) {
      // Already confirmed — idempotent, just return current state
      return this.getNomination(companyId, meetingId);
    }

    await this.prisma.meeting.update({
      where: { id: meetingId },
      data: { chairNomineeConfirmedBy: { push: userId } } as any,
    });

    await this.audit.log({
      companyId, userId,
      action: 'CHAIRPERSON_NOMINATION_CONFIRMED',
      entity: 'Meeting', entityId: meetingId,
      metadata: { nomineeId: (meeting as any).chairNomineeId },
    });

    return this.getNomination(companyId, meetingId);
  }

  async electChairperson(companyId: string, meetingId: string, chairpersonId: string, userId: string) {
    const meeting = await this.prisma.meeting.findFirst({ where: { id: meetingId, companyId } });
    if (!meeting) throw new NotFoundException('Meeting not found');
    if (['SIGNED', 'LOCKED'].includes(meeting.status))
      throw new BadRequestException('Cannot change chairperson on a signed meeting');

    // Validate nominee is the confirmed one (or skip if direct election without nomination)
    const nomineeId   = (meeting as any).chairNomineeId;
    const confirmedBy = (meeting as any).chairNomineeConfirmedBy ?? [];
    const directors   = await this.prisma.companyUser.count({
      where: { companyId, role: { in: ['DIRECTOR', 'COMPANY_SECRETARY'] }, acceptedAt: { not: null } },
    });
    const majorityNeeded = Math.max(1, Math.ceil(directors / 2));

    if (nomineeId && nomineeId !== chairpersonId) {
      throw new BadRequestException('The nominee being elected must match the pending nomination');
    }
    if (nomineeId && confirmedBy.length < majorityNeeded) {
      throw new BadRequestException(
        `Majority not yet reached. ${confirmedBy.length} of ${directors} confirmed, need ${majorityNeeded}.`,
      );
    }

    const membership = await this.prisma.companyUser.findFirst({
      where: { companyId, userId: chairpersonId, role: { in: ['DIRECTOR', 'COMPANY_SECRETARY'] }, acceptedAt: { not: null } },
    });
    if (!membership) throw new BadRequestException('Nominated chairperson must be a Director or CS');

    // Set chairperson and clear nomination state
    const updated = await this.prisma.meeting.update({
      where: { id: meetingId },
      data: {
        chairpersonId,
        chairNomineeId:          null,
        chairNomineeProposedBy:  null,
        chairNomineeConfirmedBy: [],
      } as any,
    });

    await this.audit.log({
      companyId, userId,
      action: 'MEETING_CHAIRPERSON_ELECTED',
      entity: 'Meeting', entityId: meetingId,
      metadata: { chairpersonId },
    });

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

    // SCHEDULED → IN_PROGRESS: no pre-condition.
    // The correct SS-1 sequence is: meeting opens → chairperson elected →
    // chairperson takes roll call and records attendance → quorum confirmed on record.
    // All of this happens inside the meeting, not before it opens.

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
      role: m.role,
      isWorkspaceAdmin: m.isWorkspaceAdmin,
      attendance: recordMap.get(m.user.id) ?? null,
    }));
  }

  // ── Roll call attendance recording ───────────────────────────────────────────
  //
  //  Called by the chairperson during roll call (agenda item 2).
  //  Chairperson marks each director: IN_PERSON, VIDEO, PHONE, or ABSENT.
  //  For VIDEO/PHONE the location + noThirdParty fields are recorded per SS-1 Rule 3(4).
  //  Meeting must be IN_PROGRESS (chairperson already elected as item 1).

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

    if (meeting.status !== 'IN_PROGRESS') {
      throw new BadRequestException(
        'Attendance is recorded by the Chairperson during roll call after the meeting has opened.',
      );
    }

    const requester = await this.prisma.companyUser.findUnique({
      where: { userId_companyId: { userId: requestingUserId, companyId } },
    });
    if (!requester) throw new ForbiddenException('Not a member of this company');

    const isChairperson = meeting.chairpersonId === requestingUserId;
    const isCS = requester.role === 'COMPANY_SECRETARY';

    // Only chairperson or CS can record attendance during roll call
    if (!isChairperson && !isCS) {
      throw new ForbiddenException(
        'Only the elected Chairperson or Company Secretary can record attendance during roll call (SS-1).',
      );
    }

    if (!['IN_PERSON', 'VIDEO', 'PHONE', 'ABSENT'].includes(mode)) {
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