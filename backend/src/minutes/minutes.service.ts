// ─── minutes/minutes.service.ts ───────────────────────────────────────────────
// Generates structured meeting minutes from meeting data,
// handles chairman signature, and locks the document permanently.

import {
  Injectable, NotFoundException, ForbiddenException, BadRequestException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { MinutesStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class MinutesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async generate(companyId: string, meetingId: string, userId: string) {
    const meeting = await this.prisma.meeting.findFirst({
      where: { id: meetingId, companyId },
      include: {
        agendaItems: { orderBy: { order: 'asc' } },
        resolutions: {
          include: {
            votes: { include: { user: { select: { name: true } } } },
          },
        },
        attendance: {
          include: { user: { select: { id: true, name: true } } },
        },
        company: true,
      },
    });
    if (!meeting) throw new NotFoundException('Meeting not found');

    const content = this.buildMinutesContent(meeting);

    const existing = await this.prisma.minutes.findUnique({ where: { meetingId } });

    if (existing && existing.status !== MinutesStatus.DRAFT) {
      throw new BadRequestException('Minutes have already been signed and cannot be regenerated');
    }

    const minutes = existing
      ? await this.prisma.minutes.update({ where: { meetingId }, data: { content } })
      : await this.prisma.minutes.create({ data: { meetingId, content } });

    await this.audit.log({
      companyId, userId,
      action: 'MINUTES_GENERATED',
      entity: 'Minutes',
      entityId: minutes.id,
    });

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

    const membership = await this.prisma.companyUser.findUnique({
      where: { userId_companyId: { userId, companyId } },
    });
    if (!membership?.isChairman) {
      throw new ForbiddenException('Only the Chairman can sign the minutes');
    }

    // SHA-256 of content + signer identity — unique to this signing event
    const signatureHash = crypto
      .createHash('sha256')
      .update(`${minutes.content}|${userId}|${new Date().toISOString()}`)
      .digest('hex');

    const signed = await this.prisma.minutes.update({
      where: { id: minutes.id },
      data: {
        status: MinutesStatus.SIGNED,
        signedById: userId,
        signedAt: new Date(),
        signatureHash,
      },
    });

    await this.prisma.meeting.update({
      where: { id: meetingId },
      data: { status: 'SIGNED' },
    });

    await this.audit.log({
      companyId, userId,
      action: 'MINUTES_SIGNED',
      entity: 'Minutes',
      entityId: minutes.id,
      metadata: { signatureHash },
    });

    return signed;
  }

  private buildMinutesContent(meeting: any): string {
    const modeLabel: Record<string, string> = {
      IN_PERSON: 'In Person',
      VIDEO:     'Video Conference',
      PHONE:     'Phone',
    };

    const present = (meeting.attendance ?? []).filter((a: any) => a.mode !== 'ABSENT');
    const absent  = (meeting.attendance ?? []).filter((a: any) => a.mode === 'ABSENT');

    const presentRows = present.map((a: any) =>
      `<tr><td>${a.user.name}</td><td>${modeLabel[a.mode] ?? a.mode}</td></tr>`
    ).join('');

    const absentNames = absent.map((a: any) => a.user.name).join(', ') || 'None';

    // Sec. 174 — quorum is 1/3rd of total directors or 2, whichever is higher
    const totalDirectors  = meeting.attendance?.length ?? 0;
    const quorumRequired  = Math.max(2, Math.ceil(totalDirectors / 3));
    const presentCount    = present.length;
    const quorumMet       = presentCount >= quorumRequired;
    const quorumStatement = quorumMet
      ? `Quorum was present. ${presentCount} of ${totalDirectors} directors attended (minimum required: ${quorumRequired}).`
      : `<strong style="color:red">WARNING: Quorum was NOT met. ${presentCount} of ${totalDirectors} directors attended (minimum required: ${quorumRequired}).</strong>`;

    const resolutionBlocks = (meeting.resolutions ?? [])
      .map((res: any, idx: number) => {
        const approvals   = res.votes.filter((v: any) => v.value === 'APPROVE').map((v: any) => v.user.name);
        const rejections  = res.votes.filter((v: any) => v.value === 'REJECT').map((v: any) => v.user.name);
        const abstentions = res.votes.filter((v: any) => v.value === 'ABSTAIN').map((v: any) => v.user.name);

        // Sec. 118(5) — dissenting directors must be named explicitly
        const dissentLine = rejections.length > 0
          ? `<p style="color:#c0392b"><strong>Directors who dissented (Sec. 118(5)):</strong> ${rejections.join(', ')}</p>`
          : '';
        const abstainLine = abstentions.length > 0
          ? `<p><strong>Directors who abstained:</strong> ${abstentions.join(', ')}</p>`
          : '';

        return `
          <div class="resolution">
            <h3>Resolution ${idx + 1}: ${res.title}</h3>
            <div class="resolution-text">${res.text}</div>
            <div class="vote-summary">
              <strong>Result: ${res.status}</strong><br/>
              <p><strong>In favour (${approvals.length}):</strong> ${approvals.join(', ') || 'None'}</p>
              ${dissentLine}
              ${abstainLine}
            </div>
          </div>`;
      })
      .join('');

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

          <h2>Agenda</h2>
          <ol>${(meeting.agendaItems ?? []).map((a: any) =>
            `<li><strong>${a.title}</strong>${a.description ? ` — ${a.description}` : ''}</li>`
          ).join('')}</ol>

          <h2>Resolutions</h2>
          ${resolutionBlocks || '<p>No resolutions recorded for this meeting.</p>'}

          <div class="signature-block">
            <div>
              <p>________________________</p>
              <p>Chairman's Signature</p>
            </div>
            <div>
              <p>Date: _______________</p>
            </div>
          </div>
        </body>
      </html>`;
  }
}
