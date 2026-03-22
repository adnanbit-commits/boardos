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
import { MeetingGateway } from '../realtime/meeting.gateway';

@Injectable()
export class MinutesService {
  constructor(
    private readonly prisma:        PrismaService,
    private readonly audit:         AuditService,
    private readonly storage:       StorageService,
    private readonly notifications: NotificationService,
    private readonly gateway:       MeetingGateway,
  ) {}

  async generate(companyId: string, meetingId: string, userId: string) {
    const meeting = await this.prisma.meeting.findFirst({
      where: { id: meetingId, companyId },
      include: {
        agendaItems:  { orderBy: { order: 'asc' } },
        resolutions:  { include: { votes: { include: { user: { select: { name: true } } } } } },
        // Pull location (virtual attendance) alongside name for SS-1 attendance record
        attendance: {
          include: {
            user: {
              select: {
                id: true, name: true,
                // Pull DIN and designation via CompanyUser join
                companyUsers: {
                  where: { companyId },
                  select: { din: true, designationLabel: true, additionalDesignation: true, role: true },
                },
              },
            },
          },
        },
        declarations: { include: { user: { select: { id: true, name: true } } } },
        company: true,
      },
    });
    if (!meeting) throw new NotFoundException('Meeting not found');

    // Pull CS members in attendance separately — they appear in minutes
    // as "In Attendance" distinct from the director attendance table
    const csMembers = await this.prisma.companyUser.findMany({
      where: { companyId, role: 'COMPANY_SECRETARY', acceptedAt: { not: null } },
      include: { user: { select: { id: true, name: true } } },
    });

    // Resolve chairperson and recorder names for minutes header
    const chairpersonName  = await this.resolveUserName(meeting.chairpersonId);
    const recorderName     = await this.resolveUserName(meeting.minutesRecorderId);

    const content = this.buildMinutesContent(meeting, chairpersonName, recorderName, csMembers);

    const existing = await this.prisma.minutes.findUnique({ where: { meetingId } });
    if (existing && existing.status !== MinutesStatus.DRAFT) {
      throw new BadRequestException('Minutes have already been signed and cannot be regenerated');
    }

    const minutes = existing
      ? await this.prisma.minutes.update({ where: { meetingId }, data: { content } })
      : await this.prisma.minutes.create({ data: { meetingId, content } });

    await this.audit.log({ companyId, userId, action: 'MINUTES_GENERATED', entity: 'Minutes', entityId: minutes.id });
    this.gateway.broadcastMinutesUpdated(meetingId);
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

  private buildMinutesContent(
    meeting: any,
    chairpersonName: string | null,
    recorderName: string | null,
    csMembers: any[] = [],
  ): string {
    const co = meeting.company;

    // ── Helpers ──────────────────────────────────────────────────────────────
    const modeLabel: Record<string, string> = {
      IN_PERSON: 'In Person',
      VIDEO: 'Video Conference',
      PHONE: 'Phone',
      REQUESTED_VIDEO: 'Video Conference',
      REQUESTED_PHONE: 'Phone',
    };

    const fmt = (d: Date | string) => new Date(d).toLocaleDateString('en-IN', {
      weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
    });

    const fmtTime = (d: Date | string | null | undefined): string => d
      ? new Date(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
      : '&mdash;';

    const year = new Date(meeting.scheduledAt).getFullYear();

    // ── Venue ─────────────────────────────────────────────────────────────────
    const isVirtual = !!(meeting.videoUrl);
    const venueText = isVirtual
      ? ((meeting.deemedVenue || co.registeredAt || 'Registered Office') + ' (via ' + (meeting.videoProvider || 'video conference') + ')')
      : (meeting.location || co.registeredAt || '&mdash;');

    // ── Attendance — sort chairperson first, then alphabetically ─────────────
    const allAttendance = meeting.attendance ?? [];
    const present = (allAttendance as any[])
      .filter((a: any) => a.mode !== 'ABSENT')
      .sort((a: any, b: any) => {
        if (a.user.id === meeting.chairpersonId) return -1;
        if (b.user.id === meeting.chairpersonId) return 1;
        return a.user.name.localeCompare(b.user.name);
      });
    const absent = (allAttendance as any[]).filter((a: any) => a.mode === 'ABSENT');

    const getDesignation = (a: any): string => {
      const cu = a.user.companyUsers?.[0];
      if (cu?.designationLabel) return cu.designationLabel;
      if (cu?.additionalDesignation) {
        return cu.additionalDesignation
          .replace(/_/g, ' ')
          .toLowerCase()
          .replace(/\b\w/g, (c: string) => c.toUpperCase());
      }
      if (cu?.role === 'COMPANY_SECRETARY') return 'Company Secretary';
      return 'Director';
    };

    const getDin = (a: any): string => a.user.companyUsers?.[0]?.din ?? '&mdash;';

    const presentRows = present.map((a: any) => {
      const isChair   = a.user.id === meeting.chairpersonId;
      const nameCell  = isChair ? '<strong>' + a.user.name + '</strong> (Chairperson)' : a.user.name;
      const locCell   = a.mode !== 'IN_PERSON' ? (a.location ?? '&mdash;') : '&mdash;';
      return '<tr>'
        + '<td>' + nameCell + '</td>'
        + '<td>' + getDin(a) + '</td>'
        + '<td>' + getDesignation(a) + '</td>'
        + '<td>' + (modeLabel[a.mode] ?? a.mode) + '</td>'
        + '<td>' + locCell + '</td>'
        + '</tr>';
    }).join('');

    const absentNames = absent.map((a: any) => a.user.name).join(', ') || 'None';

    const csLine = csMembers.length > 0
      ? '<p><strong>In Attendance:</strong> ' + csMembers.map((m: any) => m.user.name).join(', ') + ' (Company Secretary)</p>'
      : '';

    // ── Quorum (Sec. 174) ─────────────────────────────────────────────────────
    const totalDirectors  = allAttendance.length;
    const quorumRequired  = Math.max(2, Math.ceil(totalDirectors / 3));
    const presentCount    = present.length;
    const quorumMet       = presentCount >= quorumRequired;
    const quorumStatement = quorumMet
      ? 'Quorum was present. ' + presentCount + ' of ' + totalDirectors + ' directors attended (minimum required: ' + quorumRequired + ').'
      : '<strong style="color:red">WARNING: Quorum NOT met. ' + presentCount + ' of ' + totalDirectors + ' directors present (minimum required: ' + quorumRequired + ').</strong>';

    // ── Director Declarations ─────────────────────────────────────────────────
    const declarationsByUser = new Map<string, any[]>();
    for (const d of (meeting.declarations ?? [])) {
      if (!declarationsByUser.has(d.userId)) declarationsByUser.set(d.userId, []);
      declarationsByUser.get(d.userId)!.push(d);
    }
    const declarationRows = Array.from(declarationsByUser.entries()).map(([uid, forms]) => {
      const director = (meeting.declarations as any[]).find((d: any) => d.userId === uid)?.user?.name ?? uid;
      const formCells = ['DIR_2', 'DIR_8', 'MBP_1'].map(f => {
        const rec    = forms.find((d: any) => d.formType === f);
        const status = rec?.received ? '&#10003; Received' : '&mdash; Not received';
        const notes  = rec?.notes ? ' <em>(' + rec.notes + ')</em>' : '';
        return '<td>' + status + notes + '</td>';
      }).join('');
      return '<tr><td>' + director + '</td>' + formCells + '</tr>';
    }).join('');

    // ── Agenda ────────────────────────────────────────────────────────────────
    const agendaItems = (meeting.agendaItems ?? []).map((a: any) => {
      const aobNote = a.isAob
        ? ' <span style="color:#b45309;font-size:10pt">[Any Other Business &mdash; admitted with Chairperson\'s permission]</span>'
        : '';
      const desc = a.description ? ' &mdash; ' + a.description : '';
      return '<li><strong>' + a.title + '</strong>' + desc + aobNote + '</li>';
    }).join('');

    // ── Resolutions ───────────────────────────────────────────────────────────
    const serialPrefix = 'BM/' + year;
    let resolutionSerial = 0;

    const resolutionBlocks = (meeting.resolutions ?? []).map((res: any) => {
      if (res.type === 'NOTING') {
        return '<div class="resolution noting">'
          + '<p class="res-title">Noting: ' + res.title + ' <span class="res-badge">[Taken on Record]</span></p>'
          + '<div class="resolution-text">' + res.motionText + '</div>'
          + '<p><strong>Status:</strong> ' + (res.status === 'NOTED' ? 'Placed on record' : res.status) + '</p>'
          + '</div>';
      }

      resolutionSerial++;
      const serialNo    = serialPrefix + '/' + String(resolutionSerial).padStart(3, '0');
      const approvals   = (res.votes as any[]).filter((v: any) => v.value === 'APPROVE').map((v: any) => v.user.name);
      const rejections  = (res.votes as any[]).filter((v: any) => v.value === 'REJECT').map((v: any) => v.user.name);
      const abstentions = (res.votes as any[]).filter((v: any) => v.value === 'ABSTAIN').map((v: any) => v.user.name);
      const passed      = res.status === 'APPROVED';
      const minutesText = passed ? (res.resolutionText || res.motionText) : res.motionText;

      const dissentLine  = rejections.length > 0
        ? '<p style="color:#c0392b"><strong>Directors who dissented (Sec. 118(5)):</strong> ' + rejections.join(', ') + '</p>'
        : '';
      const abstainLine  = abstentions.length > 0
        ? '<p><strong>Directors who abstained:</strong> ' + abstentions.join(', ') + '</p>'
        : '';

      return '<div class="resolution' + (passed ? ' passed' : '') + '">'
        + '<p class="res-title">' + (passed ? 'Resolution' : 'Motion') + ' No. ' + serialNo + ': ' + res.title + '</p>'
        + '<div class="resolution-text">' + minutesText + '</div>'
        + '<div class="vote-summary">'
        + '<strong>Result: ' + (passed ? 'PASSED &mdash; Resolution carried' : res.status) + '</strong>'
        + '<p><strong>In favour (' + approvals.length + '):</strong> ' + (approvals.join(', ') || 'None') + '</p>'
        + dissentLine + abstainLine
        + '</div>'
        + '</div>';
    }).join('');

    // ── Letterhead ────────────────────────────────────────────────────────────
    const letterhead = '<div class="letterhead">'
      + '<div class="company-name">' + co.name + '</div>'
      + (co.cin        ? '<div class="company-meta">CIN: ' + co.cin + '</div>' : '')
      + (co.registeredAt ? '<div class="company-meta">Registered Office: ' + co.registeredAt + '</div>' : '')
      + (co.email      ? '<div class="company-meta">Email: ' + co.email + '</div>' : '')
      + (co.website    ? '<div class="company-meta">Website: ' + co.website + '</div>' : '')
      + '</div>'
      + '<hr class="letterhead-rule"/>';

    const recorderLine = recorderName
      ? recorderName + ' (Authorised by Board)'
      : (chairpersonName ?? '&mdash;');

    const meetingHeader = '<div class="meeting-header">'
      + '<h1>Minutes of Board Meeting</h1>'
      + '<p class="meeting-ref">Meeting No. ' + (meeting.meetingSerialNumber ?? '&mdash;') + ' of ' + year + '</p>'
      + '</div>'
      + '<table class="details-table">'
      + '<tr><th>Type of Meeting</th><td>Board Meeting</td></tr>'
      + '<tr><th>Day &amp; Date</th><td>' + fmt(meeting.scheduledAt) + '</td></tr>'
      + '<tr><th>Time of Commencement</th><td>' + fmtTime(meeting.commencementTime) + '</td></tr>'
      + '<tr><th>Time of Conclusion</th><td>' + fmtTime(meeting.conclusionTime) + '</td></tr>'
      + '<tr><th>Venue</th><td>' + venueText + '</td></tr>'
      + '<tr><th>Chairperson</th><td>' + (chairpersonName ?? '&mdash;') + '</td></tr>'
      + '<tr><th>Minutes Recorded by</th><td>' + recorderLine + '</td></tr>'
      + '</table>';

    const signatoryName  = recorderName ?? chairpersonName ?? 'Authorised Signatory';
    const signatoryTitle = recorderName ? 'Minutes Recorder (Authorised by Board)' : 'Chairperson';

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <style>
    * { box-sizing: border-box; }
    body { font-family: 'Times New Roman', serif; font-size: 12pt; line-height: 1.8; padding: 50px 60px; color: #1a1a1a; }
    .letterhead { text-align: center; margin-bottom: 8px; }
    .company-name { font-size: 16pt; font-weight: bold; text-transform: uppercase; letter-spacing: 0.05em; }
    .company-meta { font-size: 10pt; color: #444; margin-top: 2px; }
    .letterhead-rule { border: none; border-top: 2px solid #1a1a1a; margin: 10px 0 20px; }
    .meeting-header { text-align: center; margin-bottom: 16px; }
    h1 { font-size: 15pt; text-transform: uppercase; letter-spacing: 0.08em; margin: 0 0 4px; }
    .meeting-ref { font-size: 11pt; color: #555; margin: 0; }
    h2 { font-size: 12pt; font-weight: bold; margin-top: 28px; margin-bottom: 8px; border-bottom: 1px solid #aaa; padding-bottom: 3px; text-transform: uppercase; letter-spacing: 0.05em; }
    table { width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 11pt; }
    .details-table th { width: 35%; background: #f5f5f5; }
    th, td { border: 1px solid #bbb; padding: 7px 10px; text-align: left; vertical-align: top; }
    th { font-weight: bold; }
    .quorum-box { padding: 10px 14px; border: 1px solid #bbb; background: #fafafa; margin: 10px 0; font-size: 11pt; }
    .resolution { margin: 18px 0; padding: 14px 16px; border-left: 3px solid #555; page-break-inside: avoid; }
    .resolution.passed { border-left-color: #1a5c1a; }
    .resolution.noting { border-left-color: #6b7280; background: #f9fafb; }
    .res-title { font-weight: bold; margin: 0 0 8px; font-size: 12pt; }
    .res-badge { font-size: 10pt; color: #6b7280; font-weight: normal; }
    .resolution-text { margin: 8px 0; font-style: italic; line-height: 1.7; }
    .vote-summary { margin-top: 10px; font-size: 10pt; color: #444; }
    .signature-block { margin-top: 60px; display: flex; justify-content: space-between; page-break-inside: avoid; }
    .sig-line { border-top: 1px solid #333; width: 220px; margin-bottom: 6px; }
    .doc-footer { margin-top: 40px; padding-top: 10px; border-top: 1px solid #ccc; font-size: 9pt; color: #888; text-align: center; }
  </style>
</head>
<body>
  ${letterhead}
  ${meetingHeader}

  <h2>Attendance</h2>
  ${present.length > 0 ? `<table>
    <tr>
      <th>Name</th>
      <th>DIN</th>
      <th>Designation</th>
      <th>Mode of Attendance</th>
      <th>Location (if virtual)</th>
    </tr>
    ${presentRows}
  </table>` : '<p>No attendance recorded.</p>'}
  ${csLine}
  <p><strong>Directors who were absent:</strong> ${absentNames}</p>

  <h2>Quorum (Section 174)</h2>
  <div class="quorum-box">${quorumStatement}</div>

  ${declarationsByUser.size > 0 ? `<h2>Director Declarations</h2>
  <table>
    <tr>
      <th>Director</th>
      <th>DIR-2 (Consent to act)</th>
      <th>DIR-8 (Non-disqualification)</th>
      <th>MBP-1 (Disclosure of interest)</th>
    </tr>
    ${declarationRows}
  </table>` : ''}

  <h2>Agenda</h2>
  <ol>${agendaItems}</ol>

  <h2>Business Transacted</h2>
  ${resolutionBlocks || '<p>No resolutions recorded for this meeting.</p>'}

  <div class="signature-block">
    <div>
      <div class="sig-line"></div>
      <p style="margin:0;font-weight:bold">${signatoryName}</p>
      <p style="margin:2px 0 0;font-size:10pt;color:#555">${signatoryTitle}</p>
      <p style="margin:2px 0 0;font-size:10pt;color:#555">Date: _______________</p>
    </div>
    <div>
      <div class="sig-line"></div>
      <p style="margin:0;font-weight:bold">${chairpersonName ?? '&mdash;'}</p>
      <p style="margin:2px 0 0;font-size:10pt;color:#555">Chairperson</p>
      <p style="margin:2px 0 0;font-size:10pt;color:#555">Date: _______________</p>
    </div>
  </div>

  <div class="doc-footer">
    These minutes were generated by SafeMinutes &mdash; a product of Passhai Technologies Private Limited.
    Minutes are subject to confirmation at the next Board Meeting per SS-1 Para 7.2.
    Serial No: ${meeting.meetingSerialNumber ?? '&mdash;'} | Generated: ${new Date().toLocaleDateString('en-IN')}
  </div>
</body>
</html>`;
  }

  // ── Attendance Register export ──────────────────────────────────────────────
  // Generates a separate SS-1 attendance register PDF for the meeting.
  // SS-1 Para 4 requires a separate attendance register maintained at the
  // registered office, preserved for 8 financial years from last entry.
  // All data comes from existing attendance records — no schema changes needed.

  async exportAttendanceRegister(companyId: string, meetingId: string, userId: string) {
    const meeting = await this.prisma.meeting.findFirst({
      where: { id: meetingId, companyId },
      include: {
        attendance: {
          include: {
            user: {
              select: {
                id: true, name: true,
                companyUsers: {
                  where: { companyId },
                  select: { din: true, designationLabel: true, additionalDesignation: true, role: true },
                },
              },
            },
          },
        },
        company: true,
      },
    });
    if (!meeting) throw new NotFoundException('Meeting not found');

    const csMembers = await this.prisma.companyUser.findMany({
      where: { companyId, role: 'COMPANY_SECRETARY', acceptedAt: { not: null } },
      include: { user: { select: { id: true, name: true } } },
    });

    const chairpersonName = await this.resolveUserName(meeting.chairpersonId);
    const html            = this.buildAttendanceRegisterHtml(meeting, chairpersonName, csMembers);

    const browser = await puppeteer.launch({
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
      headless: true,
    });

    let pdfBuffer: Buffer;
    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0' });
      pdfBuffer = Buffer.from(await page.pdf({
        format: 'A4',
        margin: { top: '20mm', bottom: '20mm', left: '20mm', right: '20mm' },
        printBackground: true,
      }));
    } finally {
      await browser.close();
    }

    const objectPath  = this.storage.buildArchivePath(companyId, 'attendance-registers', meetingId + '.pdf');
    await this.storage.uploadArchiveFile(objectPath, pdfBuffer, 'application/pdf', {
      'x-safeminutes-meeting-id': meetingId,
      'x-safeminutes-document':   'attendance-register',
    });
    const downloadUrl = await this.storage.getDownloadUrl(objectPath, 120);

    await this.audit.log({
      companyId, userId,
      action:   'ATTENDANCE_REGISTER_EXPORTED',
      entity:   'Meeting',
      entityId: meetingId,
    });

    return { downloadUrl, objectPath };
  }

  private buildAttendanceRegisterHtml(
    meeting: any,
    chairpersonName: string | null,
    csMembers: any[],
  ): string {
    const co   = meeting.company;
    const year = new Date(meeting.scheduledAt).getFullYear();

    const fmt = (d: Date | string) => new Date(d).toLocaleDateString('en-IN', {
      weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
    });

    const fmtTime = (d: Date | string | null | undefined): string => d
      ? new Date(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
      : '&mdash;';

    const modeLabel: Record<string, string> = {
      IN_PERSON: 'In Person', VIDEO: 'Video Conference', PHONE: 'Phone',
      REQUESTED_VIDEO: 'Video Conference', REQUESTED_PHONE: 'Phone',
    };

    const isVirtual = !!(meeting.videoUrl);
    const venueText = isVirtual
      ? ((meeting.deemedVenue || co.registeredAt || 'Registered Office') + ' (via ' + (meeting.videoProvider || 'video conference') + ')')
      : (meeting.location || co.registeredAt || '&mdash;');

    const getDesignation = (a: any): string => {
      const cu = a.user.companyUsers?.[0];
      if (cu?.designationLabel) return cu.designationLabel;
      if (cu?.additionalDesignation) {
        return cu.additionalDesignation
          .replace(/_/g, ' ')
          .toLowerCase()
          .replace(/\b\w/g, (c: string) => c.toUpperCase());
      }
      return 'Director';
    };

    const getDin = (a: any): string => a.user.companyUsers?.[0]?.din ?? '&mdash;';

    // Sort: chairperson first, then present directors alphabetically, then absent
    const allAttendance = meeting.attendance ?? [];
    const present = (allAttendance as any[])
      .filter((a: any) => a.mode !== 'ABSENT')
      .sort((a: any, b: any) => {
        if (a.user.id === meeting.chairpersonId) return -1;
        if (b.user.id === meeting.chairpersonId) return 1;
        return a.user.name.localeCompare(b.user.name);
      });
    const absent = (allAttendance as any[]).filter((a: any) => a.mode === 'ABSENT');

    let srNo = 0;
    const presentRows = present.map((a: any) => {
      srNo++;
      const isChair  = a.user.id === meeting.chairpersonId;
      const nameCell = isChair ? '<strong>' + a.user.name + '</strong>' : a.user.name;
      const locCell  = a.mode !== 'IN_PERSON' ? (a.location ?? '&mdash;') : '&mdash;';
      return '<tr>'
        + '<td style="text-align:center">' + srNo + '</td>'
        + '<td>' + nameCell + '</td>'
        + '<td style="text-align:center">' + getDin(a) + '</td>'
        + '<td>' + getDesignation(a) + (isChair ? ' (Chairperson)' : '') + '</td>'
        + '<td style="text-align:center">' + (modeLabel[a.mode] ?? a.mode) + '</td>'
        + '<td>' + locCell + '</td>'
        + '<td style="width:100px">&nbsp;</td>'
        + '</tr>';
    }).join('');

    const absentRows = absent.map((a: any) => {
      srNo++;
      return '<tr style="color:#888">'
        + '<td style="text-align:center">' + srNo + '</td>'
        + '<td>' + a.user.name + '</td>'
        + '<td style="text-align:center">' + getDin(a) + '</td>'
        + '<td>' + getDesignation(a) + '</td>'
        + '<td style="text-align:center">Absent</td>'
        + '<td>&mdash;</td>'
        + '<td>&mdash;</td>'
        + '</tr>';
    }).join('');

    const csLine = csMembers.length > 0
      ? '<p style="margin:10px 0 0"><strong>Company Secretary in Attendance:</strong> '
        + csMembers.map((m: any) => m.user.name).join(', ') + '</p>'
      : '';

    const letterhead = '<div style="text-align:center;margin-bottom:8px">'
      + '<div style="font-size:15pt;font-weight:bold;text-transform:uppercase;letter-spacing:0.05em">' + co.name + '</div>'
      + (co.cin ? '<div style="font-size:10pt;color:#444;margin-top:2px">CIN: ' + co.cin + '</div>' : '')
      + (co.registeredAt ? '<div style="font-size:10pt;color:#444;margin-top:2px">Registered Office: ' + co.registeredAt + '</div>' : '')
      + (co.email ? '<div style="font-size:10pt;color:#444;margin-top:2px">Email: ' + co.email + '</div>' : '')
      + '</div>'
      + '<hr style="border:none;border-top:2px solid #1a1a1a;margin:10px 0 16px"/>';

    return '<!DOCTYPE html><html><head><meta charset="utf-8"/><style>'
      + 'body{font-family:Times New Roman,serif;font-size:11pt;line-height:1.7;padding:40px 50px;color:#1a1a1a}'
      + 'h1{font-size:13pt;text-align:center;text-transform:uppercase;letter-spacing:0.08em;margin:0 0 4px}'
      + '.reg-ref{text-align:center;font-size:10pt;color:#555;margin:0 0 16px}'
      + 'table{width:100%;border-collapse:collapse;margin:12px 0;font-size:10pt}'
      + 'th,td{border:1px solid #bbb;padding:6px 8px;vertical-align:top}'
      + 'th{background:#f5f5f5;font-weight:bold;text-align:left}'
      + '.meta-table th{width:30%}'
      + '.cert-block{margin-top:48px;display:flex;justify-content:space-between}'
      + '.sig-line{border-top:1px solid #333;width:200px;margin-bottom:4px}'
      + '.footer{margin-top:32px;padding-top:8px;border-top:1px solid #ccc;font-size:8pt;color:#888;text-align:center}'
      + '</style></head><body>'
      + letterhead
      + '<h1>Attendance Register &mdash; Board Meeting</h1>'
      + '<p class="reg-ref">Meeting No. ' + (meeting.meetingSerialNumber ?? '&mdash;') + ' of ' + year + '</p>'
      + '<table class="meta-table">'
      + '<tr><th>Date</th><td>' + fmt(meeting.scheduledAt) + '</td></tr>'
      + '<tr><th>Time of Commencement</th><td>' + fmtTime(meeting.commencementTime) + '</td></tr>'
      + '<tr><th>Time of Conclusion</th><td>' + fmtTime(meeting.conclusionTime) + '</td></tr>'
      + '<tr><th>Venue</th><td>' + venueText + '</td></tr>'
      + '<tr><th>Chairperson</th><td>' + (chairpersonName ?? '&mdash;') + '</td></tr>'
      + '</table>'
      + '<table>'
      + '<tr>'
      + '<th style="width:40px">Sr.</th>'
      + '<th>Name of Director</th>'
      + '<th style="width:90px">DIN</th>'
      + '<th>Designation</th>'
      + '<th style="width:100px">Mode</th>'
      + '<th>Location (if virtual)</th>'
      + '<th style="width:100px">Signature</th>'
      + '</tr>'
      + presentRows
      + absentRows
      + '</table>'
      + csLine
      + '<div class="cert-block">'
      + '<div>'
      + '<div class="sig-line"></div>'
      + '<p style="margin:0;font-weight:bold">' + (chairpersonName ?? '&mdash;') + '</p>'
      + '<p style="margin:2px 0 0;font-size:9pt;color:#555">Chairperson</p>'
      + '<p style="margin:2px 0 0;font-size:9pt;color:#555">Certified that the above is a true record of attendance</p>'
      + '<p style="margin:2px 0 0;font-size:9pt;color:#555">Date: _______________</p>'
      + '</div>'
      + '</div>'
      + '<div class="footer">'
      + 'Attendance Register &mdash; ' + co.name + ' | Meeting No. ' + (meeting.meetingSerialNumber ?? '&mdash;') + ' of ' + year
      + ' | To be preserved for 8 financial years per SS-1 Para 4'
      + ' | Generated by SafeMinutes &mdash; Passhai Technologies Private Limited'
      + '</div>'
      + '</body></html>';
  }

  // ── PDF export ───────────────────────────────────────────────────────────────
  // Renders the HTML minutes content to PDF via Puppeteer, uploads to GCS,
  // and returns the download URL.  Called from POST /minutes/export.

  async exportPdf(companyId: string, meetingId: string, userId: string) {
    const minutes = await this.findByMeeting(companyId, meetingId);

    const browser = await puppeteer.launch({
      // Use Puppeteer's own bundled Chromium — system Chromium has crashpad
      // issues in containerised environments on Debian bookworm.
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ],
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
          'SafeMinutes',
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
