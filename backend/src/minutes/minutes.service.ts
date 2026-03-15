// ─── minutes/minutes.service.ts ───────────────────────────────────────────────
// Generates structured meeting minutes from meeting data,
// handles signing by the designated recorder (or chairman as fallback),
// and locks the document permanently.
//
// SS-1 compliance:
//   • Minutes include director declarations (DIR-2, DIR-8, MBP-1)
//   • AOB items flagged in agenda
//   • Signed by minutesRecorderId if set, else by isChairman
//   • MINUTES_CIRCULATED stage respected — signing blocked until circulated

import {
  Injectable, NotFoundException, ForbiddenException, BadRequestException,
} from '@nestjs/common';
import * as crypto    from 'crypto';
import * as puppeteer from 'puppeteer';
import { MinutesStatus } from '@prisma/client';
import { PrismaService }       from '../prisma/prisma.service';
import { AuditService }        from '../audit/audit.service';
import { StorageService }      from '../storage/storage.service';
import { NotificationService } from '../notification/notification.service';

@Injectable()
export class MinutesService {
  constructor(
    private readonly prisma:        PrismaService,
    private readonly audit:         AuditService,
    private readonly storage:       StorageService,
    private readonly notifications: NotificationService,
  ) {}

  async generate(companyId: string, meetingId: string, userId: string) {
    const meeting = await this.prisma.meeting.findFirst({
      where: { id: meetingId, companyId },
      include: {
        agendaItems:  { orderBy: { order: 'asc' } },
        resolutions:  { include: { votes: { include: { user: { select: { name: true } } } } } },
        attendance:   { include: { user: { select: { id: true, name: true } } } },
        declarations: { include: { user: { select: { id: true, name: true } } } },
        company: true,
      },
    });
    if (!meeting) throw new NotFoundException('Meeting not found');

    // Resolve chairperson and recorder names for minutes header
    const chairpersonName  = await this.resolveUserName(meeting.chairpersonId);
    const recorderName     = await this.resolveUserName(meeting.minutesRecorderId);

    const content = this.buildMinutesContent(meeting, chairpersonName, recorderName);

    const existing = await this.prisma.minutes.findUnique({ where: { meetingId } });
    if (existing && existing.status !== MinutesStatus.DRAFT) {
      throw new BadRequestException('Minutes have already been signed and cannot be regenerated');
    }

    const minutes = existing
      ? await this.prisma.minutes.update({ where: { meetingId }, data: { content } })
      : await this.prisma.minutes.create({ data: { meetingId, content } });

    await this.audit.log({ companyId, userId, action: 'MINUTES_GENERATED', entity: 'Minutes', entityId: minutes.id });
    return minutes;
  }

  async findByMeeting(companyId: string, meetingId: string) {
    const meeting = await this.prisma.meeting.findFirst({ where: { id: meetingId, companyId } });
    if (!meeting) throw new NotFoundException('Meeting not found');
    const minutes = await this.prisma.minutes.findUnique({ where: { meetingId } });
    if (!minutes) throw new NotFoundException('Minutes not yet generated');
    return minutes;
  }

  async sign(companyId: string, meetingId: string, userId: string) {
    const minutes = await this.findByMeeting(companyId, meetingId);
    if (minutes.status !== MinutesStatus.DRAFT) {
      throw new BadRequestException('Minutes are already signed');
    }

    const meeting = await this.prisma.meeting.findFirst({ where: { id: meetingId, companyId } });
    if (!meeting) throw new NotFoundException('Meeting not found');

    // SS-1: minutes must have been circulated before signing
    if (meeting.status !== 'MINUTES_CIRCULATED' && meeting.status !== 'SIGNED') {
      throw new BadRequestException(
        'Draft minutes must be circulated to all directors before signing. ' +
        'Advance the meeting to MINUTES_CIRCULATED first.',
      );
    }

    const membership = await this.prisma.companyUser.findUnique({
      where: { userId_companyId: { userId, companyId } },
    });

    // Authorised signatories: designated recorder, OR chairman if no recorder set
    const isDesignatedRecorder = (meeting as any).minutesRecorderId === userId;
    
    const isPerMeetingChair = (meeting as any).chairpersonId === userId;

    if (!isDesignatedRecorder && !isPerMeetingChair) {
      throw new ForbiddenException(
        'Only the designated minutes recorder or the meeting chairperson can sign the minutes.',
      );
    }

    const signatureHash = crypto
      .createHash('sha256')
      .update(`${minutes.content}|${userId}|${new Date().toISOString()}`)
      .digest('hex');

    const signed = await this.prisma.minutes.update({
      where: { id: minutes.id },
      data: { status: MinutesStatus.SIGNED, signedById: userId, signedAt: new Date(), signatureHash },
    });

    await this.prisma.meeting.update({ where: { id: meetingId }, data: { status: 'SIGNED' } });

    await this.audit.log({ companyId, userId, action: 'MINUTES_SIGNED', entity: 'Minutes', entityId: minutes.id, metadata: { signatureHash } });
    return signed;
  }

  // ── Minutes HTML builder ─────────────────────────────────────────────────────

  private async resolveUserName(userId: string | null | undefined): Promise<string | null> {
    if (!userId) return null;
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
    return user?.name ?? null;
  }

  private buildMinutesContent(meeting: any, chairpersonName: string | null, recorderName: string | null): string {
    const modeLabel: Record<string, string> = {
      IN_PERSON: 'In Person', VIDEO: 'Video Conference', PHONE: 'Phone',
    };

    const present = (meeting.attendance ?? []).filter((a: any) => a.mode !== 'ABSENT');
    const absent  = (meeting.attendance ?? []).filter((a: any) => a.mode === 'ABSENT');
    const presentRows = present.map((a: any) =>
      `<tr><td>${a.user.name}</td><td>${modeLabel[a.mode] ?? a.mode}</td></tr>`
    ).join('');
    const absentNames = absent.map((a: any) => a.user.name).join(', ') || 'None';

    // Sec. 174 quorum
    const totalDirectors  = meeting.attendance?.length ?? 0;
    const quorumRequired  = Math.max(2, Math.ceil(totalDirectors / 3));
    const presentCount    = present.length;
    const quorumMet       = presentCount >= quorumRequired;
    const quorumStatement = quorumMet
      ? `Quorum was present. ${presentCount} of ${totalDirectors} directors attended (minimum required: ${quorumRequired}).`
      : `<strong style="color:red">WARNING: Quorum was NOT met. ${presentCount} of ${totalDirectors} directors attended (minimum required: ${quorumRequired}).</strong>`;

    // Director declarations section (DIR-2, DIR-8, MBP-1)
    const declarationsByUser = new Map<string, any[]>();
    for (const d of (meeting.declarations ?? [])) {
      if (!declarationsByUser.has(d.userId)) declarationsByUser.set(d.userId, []);
      declarationsByUser.get(d.userId)!.push(d);
    }

    const formLabels: Record<string, string> = {
      DIR_2: 'DIR-2 (Consent to act as Director)',
      DIR_8: 'DIR-8 (Non-disqualification declaration)',
      MBP_1: 'MBP-1 (Disclosure of interest)',
    };

    const declarationRows = Array.from(declarationsByUser.entries()).map(([uid, forms]) => {
      const director = meeting.declarations.find((d: any) => d.userId === uid)?.user?.name ?? uid;
      const formCells = ['DIR_2', 'DIR_8', 'MBP_1'].map(f => {
        const rec = forms.find((d: any) => d.formType === f);
        const status = rec?.received ? '✓ Received' : '— Not received';
        const notes  = rec?.notes ? ` <em>(${rec.notes})</em>` : '';
        return `<td>${status}${notes}</td>`;
      }).join('');
      return `<tr><td>${director}</td>${formCells}</tr>`;
    }).join('');

    // Agenda with AOB flag
    const agendaItems = (meeting.agendaItems ?? []).map((a: any, i: number) =>
      `<li><strong>${a.title}</strong>${a.description ? ` — ${a.description}` : ''}${a.isAob ? ' <span style="color:#b45309;font-size:10pt">[AOB — admitted with Chairman\'s permission]</span>' : ''}</li>`
    ).join('');

    // Resolutions: NOTING type shown differently from VOTING type
    const resolutionBlocks = (meeting.resolutions ?? []).map((res: any, idx: number) => {
      if (res.type === 'NOTING') {
        return `
          <div class="resolution noting">
            <h3>Item ${idx + 1}: ${res.title} <span style="font-size:10pt;color:#6b7280">[Taken on Record]</span></h3>
            <div class="resolution-text">${res.text}</div>
            <p><strong>Status:</strong> ${res.status === 'NOTED' ? 'Placed on record' : res.status}</p>
          </div>`;
      }

      const approvals   = res.votes.filter((v: any) => v.value === 'APPROVE').map((v: any) => v.user.name);
      const rejections  = res.votes.filter((v: any) => v.value === 'REJECT').map((v: any) => v.user.name);
      const abstentions = res.votes.filter((v: any) => v.value === 'ABSTAIN').map((v: any) => v.user.name);

      const dissentLine  = rejections.length > 0
        ? `<p style="color:#c0392b"><strong>Directors who dissented (Sec. 118(5)):</strong> ${rejections.join(', ')}</p>` : '';
      const abstainLine  = abstentions.length > 0
        ? `<p><strong>Directors who abstained:</strong> ${abstentions.join(', ')}</p>` : '';

      return `
        <div class="resolution">
          <h3>Resolution ${idx + 1}: ${res.title}</h3>
          <div class="resolution-text">${res.text}</div>
          <div class="vote-summary">
            <strong>Result: ${res.status}</strong><br/>
            <p><strong>In favour (${approvals.length}):</strong> ${approvals.join(', ') || 'None'}</p>
            ${dissentLine}${abstainLine}
          </div>
        </div>`;
    }).join('');

    return `
      <html>
        <head>
          <style>
            body { font-family: 'Times New Roman', serif; font-size: 12pt; line-height: 1.8; padding: 60px; color: #1a1a1a; }
            h1 { font-size: 16pt; text-align: center; text-transform: uppercase; letter-spacing: 0.1em; }
            h2 { font-size: 13pt; margin-top: 32px; border-bottom: 1px solid #ccc; padding-bottom: 4px; }
            h3 { font-size: 12pt; margin-top: 20px; }
            table { width: 100%; border-collapse: collapse; margin: 12px 0; }
            th, td { border: 1px solid #ccc; padding: 8px 12px; text-align: left; font-size: 11pt; }
            th { background: #f5f5f5; font-weight: bold; }
            .resolution { margin: 20px 0; padding: 16px; border-left: 3px solid #333; }
            .resolution.noting { border-left-color: #6b7280; background: #f9fafb; }
            .resolution-text { margin: 10px 0; font-style: italic; }
            .vote-summary { margin-top: 12px; font-size: 10pt; color: #444; }
            .quorum-box { padding: 12px 16px; border: 1px solid #ccc; background: #fafafa; margin: 12px 0; font-size: 11pt; }
            .signature-block { margin-top: 60px; display: flex; justify-content: space-between; }
          </style>
        </head>
        <body>
          <h1>Minutes of Board Meeting</h1>
          <p style="text-align:center">${meeting.company.name}</p>

          <h2>Meeting Details</h2>
          <table>
            <tr><th>Title</th><td>${meeting.title}</td></tr>
            <tr><th>Date &amp; Time</th><td>${new Date(meeting.scheduledAt).toLocaleString('en-IN')}</td></tr>
            <tr><th>Mode</th><td>${meeting.videoUrl ? `Video Conference (${meeting.videoProvider})` : meeting.location || 'In Person'}</td></tr>
            <tr><th>Chairman</th><td>${chairpersonName ?? '—'}</td></tr>
            <tr><th>Minutes Recorded by</th><td>${recorderName ?? '—'} ${recorderName ? '(Authorised by Board)' : ''}</td></tr>
          </table>

          <h2>Attendance</h2>
          ${present.length > 0 ? `
          <table>
            <tr><th>Name</th><th>Mode of Attendance</th></tr>
            ${presentRows}
          </table>` : '<p>No attendance recorded.</p>'}
          <p><strong>Directors absent:</strong> ${absentNames}</p>

          <h2>Quorum (Section 174)</h2>
          <div class="quorum-box">${quorumStatement}</div>

          ${declarationsByUser.size > 0 ? `
          <h2>Director Declarations</h2>
          <table>
            <tr><th>Director</th><th>DIR-2 (Consent)</th><th>DIR-8 (Non-disqualification)</th><th>MBP-1 (Disclosure of Interest)</th></tr>
            ${declarationRows}
          </table>` : ''}

          <h2>Agenda</h2>
          <ol>${agendaItems}</ol>

          <h2>Business Transacted</h2>
          ${resolutionBlocks || '<p>No resolutions recorded for this meeting.</p>'}

          <div class="signature-block">
            <div>
              <p>________________________</p>
              <p>${recorderName ?? chairpersonName ?? 'Authorised Signatory'}</p>
              <p style="font-size:10pt;color:#666">${recorderName ? 'Minutes Recorder (Authorised by Board)' : 'Chairman'}</p>
            </div>
            <div><p>Date: _______________</p></div>
          </div>
        </body>
      </html>`;
  }
  // ── PDF export ───────────────────────────────────────────────────────────────
  // Renders the HTML minutes content to PDF via Puppeteer, uploads to GCS,
  // and returns the download URL.  Called from POST /minutes/export.

  async exportPdf(companyId: string, meetingId: string, userId: string) {
    const minutes = await this.findByMeeting(companyId, meetingId);

    const browser = await puppeteer.launch({
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH ?? '/usr/bin/chromium',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
      headless: true,
    });

    let pdfBuffer: Buffer;
    try {
      const page = await browser.newPage();
      await page.setContent(minutes.content, { waitUntil: 'networkidle0' });
      pdfBuffer = Buffer.from(await page.pdf({
        format: 'A4',
        margin: { top: '20mm', bottom: '20mm', left: '20mm', right: '20mm' },
        printBackground: true,
      }));
    } finally {
      await browser.close();
    }

    // Signed minutes PDF — archive path for immutable retention.
    const objectPath = this.storage.buildArchivePath(companyId, 'minutes', `${meetingId}.pdf`);
    await this.storage.uploadArchiveFile(objectPath, pdfBuffer, 'application/pdf', {
      'x-boardos-meeting-id': meetingId,
    });
    const downloadUrl = await this.storage.getDownloadUrl(objectPath, 120);

    await this.audit.log({
      companyId, userId,
      action:   'MINUTES_PDF_EXPORTED',
      entity:   'Minutes',
      entityId: minutes.id,
    });

    return { downloadUrl, objectPath };
  }

  // ── Circulation email ────────────────────────────────────────────────────────
  // Called by MeetingService when status advances to MINUTES_CIRCULATED.
  // Sends the draft minutes HTML to all directors and CS members for the
  // SS-1 7-day comment window.

  async sendCirculationEmails(companyId: string, meetingId: string, actingUserId: string) {
    const [minutes, meeting, members] = await Promise.all([
      this.prisma.minutes.findUnique({ where: { meetingId } }),
      this.prisma.meeting.findFirst({
        where: { id: meetingId, companyId },
        include: { company: { select: { name: true } } },
      }),
      this.prisma.companyUser.findMany({
        where: { companyId, role: { in: ['DIRECTOR', 'COMPANY_SECRETARY'] }, acceptedAt: { not: null } },
        include: { user: { select: { id: true, name: true, email: true } } },
      }),
    ]);

    if (!minutes || !meeting) return;

    const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:3000';
    const meetingUrl  = `${frontendUrl}/companies/${companyId}/meetings/${meetingId}`;
    const deadline    = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      .toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' });

    await Promise.all(members.map(m =>
      this.notifications.send({
        userId:    m.user.id,
        toEmail:   m.user.email,
        companyId,
        type:      'MINUTES_READY',
        subject:   `Draft Minutes Circulated — ${meeting.title} | ${meeting.company.name}`,
        body: [
          `Dear ${m.user.name},`,
          '',
          `The draft minutes of the Board Meeting "${meeting.title}" have been circulated for your review.`,
          '',
          `Please review the draft minutes and raise any objections or suggestions within 7 clear days, by ${deadline}, as required under SS-1 (Secretarial Standard on Board Meetings).`,
          '',
          `View minutes: ${meetingUrl}`,
          '',
          'If you have no objections, no action is required.',
          '',
          'BoardOS',
        ].join('\n'),
      }),
    ));

    await this.audit.log({
      companyId,
      userId:   actingUserId,
      action:   'MINUTES_CIRCULATED_EMAIL_SENT',
      entity:   'Minutes',
      entityId: minutes.id,
      metadata: { recipientCount: members.length, deadline },
    });
  }

}