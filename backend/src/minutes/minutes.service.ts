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

  // Auto-generate minutes content from meeting + resolution + vote data
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
        company: true,
      },
    });
    if (!meeting) throw new NotFoundException('Meeting not found');

    // Build structured HTML content for the minutes
    const content = this.buildMinutesContent(meeting);

    // Upsert — allow regeneration while still in draft
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

  // Chairman signs — content is hashed and frozen
  async sign(companyId: string, meetingId: string, userId: string) {
    const minutes = await this.findByMeeting(companyId, meetingId);

    if (minutes.status !== MinutesStatus.DRAFT) {
      throw new BadRequestException('Minutes are already signed');
    }

    // Verify the user is the chairman of this company
    const membership = await this.prisma.companyUser.findUnique({
      where: { userId_companyId: { userId, companyId } },
    });
    if (!membership?.isChairman) {
      throw new ForbiddenException('Only the Chairman can sign the minutes');
    }

    // SHA-256 of content = tamper-evident seal
    const signatureHash = crypto
      .createHash('sha256')
      .update(minutes.content)
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

    // Transition meeting to SIGNED
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

  // Builds a clean HTML template for PDF rendering via Puppeteer
  private buildMinutesContent(meeting: any): string {
    const resolutionBlocks = meeting.resolutions
      .map((res: any, idx: number) => {
        const approvals = res.votes.filter((v: any) => v.value === 'APPROVE').map((v: any) => v.user.name);
        const rejections = res.votes.filter((v: any) => v.value === 'REJECT').map((v: any) => v.user.name);
        const abstentions = res.votes.filter((v: any) => v.value === 'ABSTAIN').map((v: any) => v.user.name);

        return `
          <div class="resolution">
            <h3>Resolution ${idx + 1}: ${res.title}</h3>
            <div class="resolution-text">${res.text}</div>
            <div class="vote-summary">
              <strong>Result: ${res.status}</strong><br/>
              In favour: ${approvals.join(', ') || 'None'}<br/>
              Against: ${rejections.join(', ') || 'None'}<br/>
              Abstained: ${abstentions.join(', ') || 'None'}
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
            .resolution { margin: 20px 0; padding: 16px; border-left: 3px solid #333; }
            .resolution-text { margin: 10px 0; font-style: italic; }
            .vote-summary { margin-top: 12px; font-size: 10pt; color: #444; }
            .signature-block { margin-top: 60px; display: flex; justify-content: space-between; }
          </style>
        </head>
        <body>
          <h1>Minutes of Board Meeting</h1>
          <p style="text-align:center">${meeting.company.name}</p>

          <h2>Meeting Details</h2>
          <p><strong>Title:</strong> ${meeting.title}</p>
          <p><strong>Date & Time:</strong> ${new Date(meeting.scheduledAt).toLocaleString('en-IN')}</p>
          <p><strong>Mode:</strong> ${meeting.videoUrl ? `Video Conference (${meeting.videoProvider})` : meeting.location || 'In Person'}</p>

          <h2>Agenda</h2>
          <ol>${meeting.agendaItems.map((a: any) => `<li>${a.title}</li>`).join('')}</ol>

          <h2>Resolutions Passed</h2>
          ${resolutionBlocks}

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
