import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { AuditService } from '../audit/audit.service';

// ── helpers ───────────────────────────────────────────────────────────────────

function currentFinancialYear(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1; // 1-based
  // Indian FY: April 1 – March 31
  return month >= 4
    ? `${year}-${String(year + 1).slice(2)}`
    : `${year - 1}-${String(year).slice(2)}`;
}

// Context-aware mandatory forms for a meeting.
// First meeting of the company: DIR_2 + DIR_8 + MBP_1 for all directors.
// Subsequent meetings same FY: DIR_8 + MBP_1 only (unless a new director
// was added since the last meeting, in which case DIR_2 is added for them).
// Carry-forward: if DIR_8/MBP_1 were already noted THIS FY at a previous
// meeting, they are satisfied — only show them if not yet noted this FY.
export const MANDATORY_FORMS = ['DIR_8', 'MBP_1'] as const; // default for backward compat

export async function getMandatoryFormsForMeeting(
  prisma: any,
  companyId: string,
  meetingId: string,
): Promise<string[]> {
  const [meeting, company] = await Promise.all([
    prisma.meeting.findUnique({ where: { id: meetingId }, select: { isFirstMeeting: true } }),
    prisma.company.findUnique({ where: { id: companyId }, select: { firstBoardMeetingLockedId: true } }),
  ]);

  const isFirstMeeting = meeting?.isFirstMeeting || !company?.firstBoardMeetingLockedId;

  if (isFirstMeeting) {
    // First board meeting: must note DIR_2 (confirm appointment), DIR_8, MBP_1
    return ['DIR_2', 'DIR_8', 'MBP_1'];
  }

  // Subsequent meetings: check if DIR_8/MBP_1 already noted this FY
  const fy = currentFinancialYear();
  const alreadyNotedThisFY = await prisma.meetingDocNote.findFirst({
    where: {
      companyId,
      formType: { in: ['DIR_8', 'MBP_1'] },
      meeting: {
        status: { in: ['SIGNED', 'LOCKED'] },
        // Only count meetings in the current FY (April 1 start)
        scheduledAt: { gte: new Date(`${fy.split('-')[0]}-04-01`) },
      },
    },
  });

  if (alreadyNotedThisFY) {
    // DIR_8/MBP_1 already satisfied this FY — no mandatory forms unless new director
    // New directors (DIR_2 not yet noted) are handled per-director in the matrix
    return [];
  }

  return ['DIR_8', 'MBP_1'];
}

@Injectable()
export class VaultService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
  ) {}

  // ══════════════════════════════════════════════════════════════════════════════
  // COMPANY STATUTORY VAULT
  // ══════════════════════════════════════════════════════════════════════════════

  async getVaultDocuments(companyId: string) {
    const docs = await this.prisma.vaultDocument.findMany({
      where: { companyId },
      include: { uploader: { select: { id: true, name: true } } },
      orderBy: { uploadedAt: 'desc' },
    });

    // Attach fresh signed download URLs
    return Promise.all(
      docs.map(async (d) => ({
        ...d,
        downloadUrl: await this.storage.getDownloadUrl(d.fileUrl),
      })),
    );
  }

  async uploadVaultDocument(
    companyId: string,
    userId: string,
    file: Express.Multer.File,
    docType: string,
    label: string,
  ) {
    const objectPath = this.storage.buildObjectPath(companyId, 'vault', file.originalname);
    await this.storage.uploadFile(objectPath, file.buffer, file.mimetype);

    const upsertWhere = docType !== 'CUSTOM'
      ? { companyId_docType_label: { companyId, docType: docType as any, label } }
      : undefined;

    let doc: any;
    if (upsertWhere) {
      doc = await this.prisma.vaultDocument.upsert({
        where: upsertWhere,
        create: { companyId, docType: docType as any, label, fileUrl: objectPath, fileName: file.originalname, fileSize: file.size, uploadedBy: userId },
        update: { fileUrl: objectPath, fileName: file.originalname, fileSize: file.size, uploadedBy: userId, uploadedAt: new Date() },
      });
    } else {
      doc = await this.prisma.vaultDocument.create({
        data: { companyId, docType: docType as any, label, fileUrl: objectPath, fileName: file.originalname, fileSize: file.size, uploadedBy: userId },
      });
    }
    await this.audit.log({ companyId, userId, action: 'VAULT_DOC_UPLOADED', entity: 'VaultDocument', entityId: doc.id, metadata: { docType, fileName: file.originalname } });
    return doc;
  }

  async deleteVaultDocument(companyId: string, docId: string, userId: string) {
    const doc = await this.prisma.vaultDocument.findFirst({ where: { id: docId, companyId } });
    if (!doc) throw new NotFoundException('Document not found');
    await this.storage.deleteObject(doc.fileUrl);
    await this.prisma.vaultDocument.delete({ where: { id: docId } });
    await this.audit.log({
      companyId, userId, action: 'VAULT_DOC_DELETED',
      entity: 'VaultDocument', entityId: docId,
      metadata: { fileName: doc.fileName },
    });
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // DIRECTOR COMPLIANCE REGISTER
  // ══════════════════════════════════════════════════════════════════════════════

  async getComplianceDocs(companyId: string, financialYear?: string) {
    const fy = financialYear ?? currentFinancialYear();
    const [members, docs] = await Promise.all([
      this.prisma.companyUser.findMany({
        where: { companyId, role: { in: ['DIRECTOR', 'COMPANY_SECRETARY'] }, acceptedAt: { not: null } },
        include: { user: { select: { id: true, name: true, email: true } } },
      }),
      this.prisma.directorComplianceDoc.findMany({
        where: { companyId, financialYear: fy },
      }),
    ]);

    // Build the matrix: for each member × each mandatory form
    const forms = ['DIR_2', 'MBP_1', 'DIR_8', 'DIR_3_KYC'];
    const matrix = members.map((m) => ({
      userId: m.user.id,
      name: m.user.name,
      email: m.user.email,
      role: m.role,
      forms: forms.map((formType) => {
        const doc = docs.find((d) => d.userId === m.user.id && d.formType === formType);
        const deadline = formType === 'DIR_3_KYC'
          ? `Sep 30, ${fy.split('-')[0]}`
          : 'On appointment / annually';
        const isOverdue = formType === 'DIR_3_KYC' && !doc?.receivedAt
          && new Date() > new Date(`${fy.split('-')[0]}-09-30`);
        return { formType, deadline, doc: doc ?? null, isOverdue };
      }),
    }));

    return { financialYear: fy, matrix };
  }

  async uploadComplianceDoc(
    companyId: string,
    actingUserId: string,
    file: Express.Multer.File,
    body: { userId: string; formType: string; financialYear?: string; notes?: string },
  ) {
    const objectPath = this.storage.buildObjectPath(companyId, 'compliance', file.originalname);
    await this.storage.uploadFile(objectPath, file.buffer, file.mimetype);
    return this.registerComplianceDoc(companyId, actingUserId, {
      ...body,
      objectPath,
      fileName: file.originalname,
      fileSize: file.size,
    });
  }

  async registerComplianceDoc(
    companyId: string,
    actingUserId: string,
    body: {
      userId: string;        // the director the form belongs to
      formType: string;
      financialYear?: string;
      objectPath?: string;
      fileName?: string;
      fileSize?: number;
      notes?: string;
    },
  ) {
    const fy = body.financialYear ?? currentFinancialYear();
    const doc = await this.prisma.directorComplianceDoc.upsert({
      where: {
        companyId_userId_formType_financialYear: {
          companyId, userId: body.userId,
          formType: body.formType as any, financialYear: fy,
        },
      },
      create: {
        companyId, userId: body.userId, formType: body.formType as any,
        financialYear: fy, fileUrl: body.objectPath, fileName: body.fileName,
        fileSize: body.fileSize, notes: body.notes,
        submittedAt: body.objectPath ? new Date() : undefined,
        recordedBy: actingUserId,
      },
      update: {
        fileUrl: body.objectPath ?? undefined,
        fileName: body.fileName ?? undefined,
        fileSize: body.fileSize ?? undefined,
        notes: body.notes ?? undefined,
        submittedAt: body.objectPath ? new Date() : undefined,
        recordedBy: actingUserId,
      },
    });
    return doc;
  }

  async markComplianceReceived(
    companyId: string,
    docId: string,
    actingUserId: string,
    received: boolean,
    notes?: string,
  ) {
    const doc = await this.prisma.directorComplianceDoc.findFirst({ where: { id: docId, companyId } });
    if (!doc) throw new NotFoundException('Compliance doc not found');
    return this.prisma.directorComplianceDoc.update({
      where: { id: docId },
      data: {
        receivedAt: received ? new Date() : null,
        notes: notes ?? doc.notes,
        recordedBy: actingUserId,
      },
    });
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // MEETING DOCUMENTS + SHARE LINK
  // ══════════════════════════════════════════════════════════════════════════════

  async getMeetingDocuments(companyId: string, meetingId: string) {
    const docs = await this.prisma.meetingDocument.findMany({
      where: { meetingId, companyId },
      include: { uploader: { select: { id: true, name: true } } },
      orderBy: { uploadedAt: 'desc' },
    });
    return Promise.all(
      docs.map(async (d) => ({
        ...d,
        downloadUrl: await this.storage.getDownloadUrl(d.fileUrl),
      })),
    );
  }

  async uploadMeetingDocument(
    companyId: string,
    meetingId: string,
    userId: string,
    file: Express.Multer.File,
    title: string,
    docType: string,
    isShared: boolean,
  ) {
    const objectPath = this.storage.buildObjectPath(companyId, 'meeting-docs', file.originalname);
    await this.storage.uploadFile(objectPath, file.buffer, file.mimetype);
    return this.prisma.meetingDocument.create({
      data: {
        meetingId, companyId, uploadedBy: userId,
        title: title || file.originalname,
        docType: docType as any,
        fileUrl: objectPath, fileName: file.originalname,
        fileSize: file.size, isShared,
      },
    });
  }

  async toggleMeetingDocShared(
    companyId: string,
    docId: string,
    isShared: boolean,
  ) {
    const doc = await this.prisma.meetingDocument.findFirst({ where: { id: docId, companyId } });
    if (!doc) throw new NotFoundException('Document not found');
    return this.prisma.meetingDocument.update({ where: { id: docId }, data: { isShared } });
  }

  async deleteMeetingDocument(companyId: string, docId: string) {
    const doc = await this.prisma.meetingDocument.findFirst({ where: { id: docId, companyId } });
    if (!doc) throw new NotFoundException('Document not found');
    await this.storage.deleteObject(doc.fileUrl);
    await this.prisma.meetingDocument.delete({ where: { id: docId } });
  }

  async getOrCreateShareLink(companyId: string, meetingId: string, userId: string) {
    const existing = await this.prisma.meetingShareLink.findUnique({ where: { meetingId } });
    if (existing) {
      if (!existing.isActive) {
        return this.prisma.meetingShareLink.update({ where: { meetingId }, data: { isActive: true } });
      }
      return existing;
    }
    return this.prisma.meetingShareLink.create({
      data: { meetingId, createdBy: userId },
    });
  }

  async deactivateShareLink(companyId: string, meetingId: string) {
    await this.prisma.meetingShareLink.update({ where: { meetingId }, data: { isActive: false } });
  }

  // Public — no auth — called from /public/meeting/:shareToken
  async getPublicMeetingPapers(shareToken: string) {
    const link = await this.prisma.meetingShareLink.findUnique({
      where: { shareToken },
      include: {
        meeting: {
          select: {
            id: true, title: true, scheduledAt: true,
            company: { select: { name: true } },
            documents: {
              where: { isShared: true },
              orderBy: { uploadedAt: 'asc' },
            },
          },
        },
      },
    });

    if (!link || !link.isActive) throw new NotFoundException('Share link not found or has been deactivated');

    // Generate short-lived download URLs for each shared doc
    const docs = await Promise.all(
      link.meeting.documents.map(async (d) => ({
        id: d.id, title: d.title, docType: d.docType,
        fileName: d.fileName, fileSize: d.fileSize,
        uploadedAt: d.uploadedAt,
        downloadUrl: await this.storage.getShareUrl(d.fileUrl),
      })),
    );

    return {
      companyName: link.meeting.company.name,
      meetingTitle: link.meeting.title,
      scheduledAt: link.meeting.scheduledAt,
      documents: docs,
    };
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // CHAIRPERSON DOCUMENT NOTING
  // ══════════════════════════════════════════════════════════════════════════════

  async getDocNotes(companyId: string, meetingId: string) {
    const [meeting, directors, existingNotes, complianceDocs] = await Promise.all([
      this.prisma.meeting.findFirst({ where: { id: meetingId, companyId } }),
      this.prisma.companyUser.findMany({
        where: { companyId, role: { in: ['DIRECTOR', 'COMPANY_SECRETARY'] }, acceptedAt: { not: null } },
        include: { user: { select: { id: true, name: true, email: true } } },
      }),
      this.prisma.meetingDocNote.findMany({
        where: { meetingId, companyId },
        include: { chair: { select: { name: true } } },
      }),
      this.prisma.directorComplianceDoc.findMany({
        where: { companyId, financialYear: currentFinancialYear() },
      }),
    ]);

    if (!meeting) throw new NotFoundException('Meeting not found');

    // For each director × each mandatory form → note status + whether doc exists in vault
    const noteMap = new Map(existingNotes.map((n) => [`${n.directorUserId}:${n.formType}`, n]));
    const compMap = new Map(complianceDocs.map((d) => [`${d.userId}:${d.formType}`, d]));

    // Get context-aware mandatory forms for this specific meeting
    const mandatoryForms = await getMandatoryFormsForMeeting(this.prisma, companyId, meetingId);

    // If no mandatory forms (already satisfied this FY), return empty matrix
    // but still show the rows so chairperson can see directors are compliant
    const formsToShow = mandatoryForms.length > 0 ? mandatoryForms : ['DIR_8', 'MBP_1'];

    const rows = await Promise.all(directors.map(async (m) => ({
      userId: m.user.id,
      name:   m.user.name,
      email:  m.user.email,
      role:   m.role,
      forms:  await Promise.all(formsToShow.map(async (formType) => {
        const note    = noteMap.get(`${m.user.id}:${formType}`);
        const compDoc = compMap.get(`${m.user.id}:${formType}`);
        return {
          formType,
          note: note ?? null,
          complianceDoc: compDoc
            ? {
                id:          compDoc.id,
                fileName:    compDoc.fileName,
                submittedAt: compDoc.submittedAt,
                // Signed download URL so the chairperson can open the actual file
                // before formally noting it — closes the review→note link.
                downloadUrl: compDoc.fileUrl
                  ? await this.storage.getDownloadUrl(compDoc.fileUrl)
                  : null,
              }
            : null,
        };
      })),
    })));

    // All noted = every director has a note for every mandatory form
    const totalRequired = directors.length * formsToShow.length;
    const totalNoted = existingNotes.length;
    const allNoted = totalNoted >= totalRequired;

    return { meetingId, chairpersonId: meeting.chairpersonId, rows, allNoted, totalRequired, totalNoted };
  }

  async noteDocument(
    companyId: string,
    meetingId: string,
    notingUserId: string,
    body: {
      directorUserId: string;
      formType: string;
      status: 'NOTED' | 'NOTED_WITH_EXCEPTION';
      exception?: string;
    },
  ) {
    const meeting = await this.prisma.meeting.findFirst({ where: { id: meetingId, companyId } });
    if (!meeting) throw new NotFoundException('Meeting not found');

    // Only the elected chairperson can note documents
    if (meeting.chairpersonId !== notingUserId) {
      throw new ForbiddenException('Only the elected Chairperson can note compliance documents');
    }

    if (!['SCHEDULED', 'IN_PROGRESS'].includes(meeting.status)) {
      throw new BadRequestException('Documents can only be noted for scheduled or in-progress meetings');
    }

    if (body.status === 'NOTED_WITH_EXCEPTION' && !body.exception?.trim()) {
      throw new BadRequestException('Exception text is required when noting with exception');
    }

    return this.prisma.meetingDocNote.upsert({
      where: {
        meetingId_directorUserId_formType: {
          meetingId, directorUserId: body.directorUserId, formType: body.formType as any,
        },
      },
      create: {
        meetingId, companyId,
        directorUserId: body.directorUserId, formType: body.formType as any,
        status: body.status as any, exception: body.exception ?? null,
        notedBy: notingUserId,
      },
      update: {
        status: body.status as any,
        exception: body.exception ?? null,
        notedBy: notingUserId,
        notedAt: new Date(),
      },
    });
  }
}
