// ─── document/document.service.ts ────────────────────────────────────────────
// Generates PDFs using Puppeteer and stores them in GCS.
// Called when certified copies of resolutions are requested.
//
// NOTE: Minutes PDF export is handled by MinutesService.exportPdf()
// which has direct access to MinutesService.buildMinutesContent().
// This service handles resolution certified copies only.

import { Injectable, NotFoundException } from '@nestjs/common';
import * as puppeteer from 'puppeteer';
import * as crypto    from 'crypto';
import { PrismaService }  from '../prisma/prisma.service';
import { AuditService }   from '../audit/audit.service';
import { StorageService } from '../storage/storage.service';

@Injectable()
export class DocumentService {
  constructor(
    private readonly prisma:   PrismaService,
    private readonly audit:    AuditService,
    private readonly storage:  StorageService,
  ) {}

  // List all documents for a company
  async listByCompany(companyId: string) {
    return this.prisma.document.findMany({
      where:   { companyId },
      include: { minutes: { select: { meetingId: true, status: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  // Generate PDF from signed minutes and store in GCS
  async generateMinutesPdf(companyId: string, meetingId: string, actorId: string) {
    const minutes = await this.prisma.minutes.findUnique({
      where:   { meetingId },
      include: { meeting: { select: { title: true } } },
    });

    if (!minutes)                    throw new NotFoundException('Minutes not found');
    if (minutes.status !== 'SIGNED') throw new Error('Only signed minutes can be exported');

    const pdfBuffer = await this.htmlToPdf(minutes.content);
    const hash      = crypto.createHash('sha256').update(pdfBuffer).digest('hex');

    // Signed minutes are statutory records — use the archive path so they
    // fall under the bucket retention policy and carry a temporary hold.
    const objectPath = this.storage.buildArchivePath(companyId, 'minutes', `${meetingId}.pdf`);
    await this.storage.uploadArchiveFile(objectPath, pdfBuffer, 'application/pdf', {
      'x-boardos-meeting-id':  meetingId,
      'x-boardos-minutes-hash': hash,
    });
    const downloadUrl = await this.storage.getDownloadUrl(objectPath, 120);

    const doc = await this.prisma.document.create({
      data: {
        companyId,
        minutesId: minutes.id,
        name:      `Minutes — ${minutes.meeting.title}`,
        type:      'minutes',
        s3Key:     objectPath,
        s3Url:     downloadUrl,
        mimeType:  'application/pdf',
        sizeBytes: pdfBuffer.length,
        hash,
        isImmutable: true,
      },
    });

    await this.audit.log({
      companyId, userId: actorId,
      action: 'MINUTES_PDF_GENERATED',
      entity: 'Document', entityId: doc.id,
    });

    return { ...doc, downloadUrl };
  }

  // Generate a certified copy of an approved resolution
  async generateCertifiedCopy(
    companyId: string,
    resolutionId: string,
    actorId: string,
  ) {
    const resolution = await this.prisma.resolution.findFirst({
      where:   { id: resolutionId, companyId },
      include: {
        votes:   { include: { user: { select: { name: true } } } },
        meeting: { include: { company: true } },
      },
    });

    if (!resolution) throw new NotFoundException('Resolution not found');
    if (resolution.status !== 'APPROVED')
      throw new Error('Only approved resolutions can be certified');

    const html      = this.buildCertifiedCopyHtml(resolution);
    const pdfBuffer = await this.htmlToPdf(html);
    const signatureHash = crypto.createHash('sha256').update(pdfBuffer).digest('hex');

    // Certified copies are statutory records — archive path + immutable storage.
    const objectPath = this.storage.buildArchivePath(
      companyId, 'certified', `${resolutionId}.pdf`,
    );
    await this.storage.uploadArchiveFile(objectPath, pdfBuffer, 'application/pdf', {
      'x-boardos-resolution-id': resolutionId,
      'x-boardos-signature-hash': signatureHash,
    });
    const downloadUrl = await this.storage.getDownloadUrl(objectPath, 120);

    const copy = await this.prisma.certifiedCopy.create({
      data: {
        resolutionId,
        documentUrl:  downloadUrl,
        s3Key:        objectPath,
        signatureHash,
      },
    });

    await this.audit.log({
      companyId, userId: actorId,
      action:   'CERTIFIED_COPY_GENERATED',
      entity:   'CertifiedCopy', entityId: copy.id,
      metadata: { signatureHash },
    });

    return { ...copy, downloadUrl };
  }

  // ── Puppeteer helper ──────────────────────────────────────────────────────
  private async htmlToPdf(html: string): Promise<Buffer> {
    const browser = await puppeteer.launch({
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH ?? '/usr/bin/chromium',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-crash-reporter',
        '--disable-extensions',
        '--disable-gpu',
        '--single-process',
        '--no-zygote',
      ],
      headless: true,
    });
    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0' });
      const pdf = await page.pdf({
        format: 'A4',
        margin: { top: '20mm', bottom: '20mm', left: '20mm', right: '20mm' },
        printBackground: true,
      });
      return Buffer.from(pdf);
    } finally {
      await browser.close();
    }
  }

  // ── Certified copy HTML template ─────────────────────────────────────────
  private buildCertifiedCopyHtml(resolution: any): string {
    const approvals = resolution.votes
      .filter((v: any) => v.value === 'APPROVE')
      .map((v: any) => v.user.name)
      .join(', ');
    const rejections = resolution.votes
      .filter((v: any) => v.value === 'REJECT')
      .map((v: any) => v.user.name)
      .join(', ');

    return `
      <html>
        <head>
          <style>
            body { font-family: 'Times New Roman', serif; font-size: 12pt; line-height: 1.8; padding: 80px; color: #1a1a1a; }
            h1 { text-align: center; font-size: 14pt; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 4px; }
            h2 { text-align: center; font-size: 12pt; font-weight: normal; color: #444; margin-top: 0; }
            .stamp { border: 2px solid #333; padding: 24px 28px; margin: 32px 0; }
            .resolution-text { font-style: italic; margin: 12px 0; padding: 12px 16px; background: #f9f9f9; border-left: 3px solid #333; }
            .footer { margin-top: 60px; font-size: 9pt; color: #666; border-top: 1px solid #ccc; padding-top: 12px; }
            table { width: 100%; border-collapse: collapse; margin: 8px 0; font-size: 11pt; }
            td { padding: 4px 0; vertical-align: top; }
            td:first-child { width: 180px; font-weight: bold; color: #333; }
          </style>
        </head>
        <body>
          <h1>Certified True Copy</h1>
          <h2>Board Resolution — ${resolution.meeting.company.name}</h2>
          ${resolution.meeting.company.cin ? `<p style="text-align:center;font-size:10pt;color:#666">CIN: ${resolution.meeting.company.cin}</p>` : ''}

          <div class="stamp">
            <table>
              <tr><td>Resolution Title</td><td>${resolution.title}</td></tr>
              <tr><td>Meeting</td><td>${resolution.meeting.title}</td></tr>
              <tr><td>Date</td><td>${new Date(resolution.meeting.scheduledAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })}</td></tr>
              <tr><td>Status</td><td>APPROVED</td></tr>
              <tr><td>In favour</td><td>${approvals || '—'}</td></tr>
              ${rejections ? `<tr><td>Dissenting</td><td>${rejections}</td></tr>` : ''}
            </table>
          </div>

          <p><strong>Resolution Text:</strong></p>
          <div class="resolution-text">${resolution.resolutionText || resolution.motionText}</div>

          <div class="footer">
            <p>This is a certified true copy of the resolution passed at the Board Meeting of ${resolution.meeting.company.name}.</p>
            <p>Generated: ${new Date().toLocaleString('en-IN')}</p>
          </div>
        </body>
      </html>`;
  }
}
