// ─── document/document.service.ts ────────────────────────────────────────────
// Generates PDFs using Puppeteer and stores them in S3.
// Called after minutes are signed or certified copies are requested.

import { Injectable, NotFoundException } from '@nestjs/common';
import * as puppeteer from 'puppeteer';
import * as crypto from 'crypto';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class DocumentService {
  private _s3: S3Client | null = null;
  private readonly bucket: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {
    this.bucket = process.env.S3_BUCKET ?? '';
  }

  /** Lazy S3 client — only initialised when AWS_REGION is present */
  private get s3(): S3Client {
    if (!this._s3) {
      const region = process.env.AWS_REGION;
      if (!region) throw new Error('AWS_REGION is not configured. Set it in backend/.env to enable S3 document storage.');
      this._s3 = new S3Client({
        region,
        credentials: {
          accessKeyId:     process.env.AWS_ACCESS_KEY_ID!,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
        },
      });
    }
    return this._s3;
  }


  // List all documents for a company
  async listByCompany(companyId: string) {
    return this.prisma.document.findMany({
      where: { companyId },
      include: { minutes: { select: { meetingId: true, status: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  // Generate PDF from signed minutes and store in S3
  async generateMinutesPdf(companyId: string, meetingId: string, userId: string) {
    const minutes = await this.prisma.minutes.findUnique({
      where: { meetingId },
      include: { meeting: { select: { title: true } } },
    });

    if (!minutes) throw new NotFoundException('Minutes not found');
    if (minutes.status !== 'SIGNED') throw new Error('Only signed minutes can be exported');

    const pdfBuffer = await this.htmlToPdf(minutes.content);
    const hash = crypto.createHash('sha256').update(pdfBuffer).digest('hex');

    const s3Key = `companies/${companyId}/minutes/${meetingId}.pdf`;
    await this.uploadToS3(s3Key, pdfBuffer);

    const doc = await this.prisma.document.create({
      data: {
        companyId,
        minutesId: minutes.id,
        name: `Minutes - ${minutes.meeting.title}`,
        type: 'minutes',
        s3Key,
        s3Url: this.getS3Url(s3Key),
        mimeType: 'application/pdf',
        sizeBytes: pdfBuffer.length,
        hash,
        isImmutable: true,
      },
    });

    await this.audit.log({
      companyId, userId,
      action: 'MINUTES_PDF_GENERATED',
      entity: 'Document',
      entityId: doc.id,
    });

    return doc;
  }

  // Generate a certified copy of an approved resolution
  async generateCertifiedCopy(companyId: string, resolutionId: string, userId: string) {
    const resolution = await this.prisma.resolution.findFirst({
      where: { id: resolutionId, companyId },
      include: {
        votes: { include: { user: { select: { name: true } } } },
        meeting: { include: { company: true } },
      },
    });

    if (!resolution) throw new NotFoundException('Resolution not found');
    if (resolution.status !== 'APPROVED') throw new Error('Only approved resolutions can be certified');

    const html = this.buildCertifiedCopyHtml(resolution);
    const pdfBuffer = await this.htmlToPdf(html);
    const signatureHash = crypto.createHash('sha256').update(pdfBuffer).digest('hex');

    const s3Key = `companies/${companyId}/certified/${resolutionId}.pdf`;
    await this.uploadToS3(s3Key, pdfBuffer);

    const copy = await this.prisma.certifiedCopy.create({
      data: {
        resolutionId,
        documentUrl: this.getS3Url(s3Key),
        s3Key,
        signatureHash,
      },
    });

    await this.audit.log({
      companyId, userId,
      action: 'CERTIFIED_COPY_GENERATED',
      entity: 'CertifiedCopy',
      entityId: copy.id,
      metadata: { signatureHash },
    });

    return copy;
  }

  // ── Puppeteer helper ──────────────────────────────────────────────────────
  private async htmlToPdf(html: string): Promise<Buffer> {
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });

    const pdf = await page.pdf({
      format: 'A4',
      margin: { top: '40px', bottom: '40px', left: '50px', right: '50px' },
      printBackground: true,
    });

    await browser.close();
    return Buffer.from(pdf);
  }

  // ── S3 helpers ────────────────────────────────────────────────────────────
  private async uploadToS3(key: string, buffer: Buffer) {
    await this.s3.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: buffer,
      ContentType: 'application/pdf',
      // Server-side encryption at rest
      ServerSideEncryption: 'AES256',
    }));
  }

  private getS3Url(key: string) {
    return `https://${this.bucket}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
  }

  // ── Certified copy HTML template ─────────────────────────────────────────
  private buildCertifiedCopyHtml(resolution: any): string {
    const approvals = resolution.votes
      .filter((v: any) => v.value === 'APPROVE')
      .map((v: any) => v.user.name)
      .join(', ');

    return `
      <html>
        <head>
          <style>
            body { font-family: 'Times New Roman', serif; font-size: 12pt; line-height: 1.8; padding: 80px; }
            h1 { text-align: center; font-size: 14pt; text-transform: uppercase; letter-spacing: 0.08em; }
            .stamp { border: 2px solid #333; padding: 20px; margin: 40px 0; }
            .footer { margin-top: 60px; font-size: 9pt; color: #666; border-top: 1px solid #ccc; padding-top: 12px; }
          </style>
        </head>
        <body>
          <h1>Certified True Copy of Board Resolution</h1>
          <p style="text-align:center"><strong>${resolution.meeting.company.name}</strong></p>
          <p style="text-align:center">CIN: ${resolution.meeting.company.cin || '—'}</p>

          <div class="stamp">
            <p><strong>Resolution Title:</strong> ${resolution.title}</p>
            <p><strong>Meeting:</strong> ${resolution.meeting.title}</p>
            <p><strong>Date:</strong> ${new Date(resolution.meeting.scheduledAt).toLocaleDateString('en-IN')}</p>
            <p><strong>Status:</strong> APPROVED</p>
            <p><strong>Voted in favour by:</strong> ${approvals}</p>
          </div>

          <p><strong>Resolution Text:</strong></p>
          <p style="font-style:italic">${resolution.text}</p>

          <div class="footer">
            <p>This is a certified true copy of the resolution passed at the Board Meeting.</p>
            <p>Document Hash (SHA-256): [HASH]</p>
            <p>Generated: ${new Date().toISOString()}</p>
          </div>
        </body>
      </html>`;
  }
}
