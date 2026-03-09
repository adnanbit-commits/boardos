// backend/src/archive/__tests__/archive.flow.spec.ts
//
// Integration tests for the Archive module.
// Tests the full SIGNED → LOCKED → certified copy → verify flow.
// Uses jest + in-memory PrismaService mock pattern matching the other test files.

import { Test, TestingModule } from '@nestjs/testing';
import { ArchiveService }      from '../archive.service';
import { PrismaService }       from '../../prisma/prisma.service';
import { DocumentService }     from '../../document/document.service';
import { AuditService }        from '../../audit/audit.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import * as crypto from 'crypto';

// ── Fixtures ─────────────────────────────────────────────────────────────────

const COMPANY_ID  = 'co-test-001';
const MEETING_ID  = 'mtg-test-001';
const ACTOR_ID    = 'user-admin-001';
const DOC_ID      = 'doc-test-001';
const MINUTES_CONTENT = 'RESOLVED THAT the board of Acme Ventures approves...';
const MINUTES_HASH = crypto.createHash('sha256').update(MINUTES_CONTENT).digest('hex');

function buildMeeting(overrides = {}) {
  return {
    id: MEETING_ID,
    companyId: COMPANY_ID,
    title: 'Q4 Board Meeting',
    status: 'SIGNED',
    scheduledAt: new Date('2026-03-14'),
    minutes: {
      id: 'min-001',
      content: MINUTES_CONTENT,
      signatureHash: MINUTES_HASH,
      signedAt: new Date(),
      status: 'SIGNED',
    },
    documents: [
      { id: DOC_ID, type: 'MINUTES_PDF', isCertifiedCopy: false, s3Url: 'https://s3.example.com/doc', s3Key: 'docs/doc-001.pdf', signatureHash: null },
    ],
    ...overrides,
  };
}

// ── Mocks ────────────────────────────────────────────────────────────────────

function buildPrismaMock(meetingOverrides = {}) {
  const meeting = buildMeeting(meetingOverrides);
  return {
    meeting: {
      findFirst: jest.fn().mockResolvedValue(meeting),
      update:    jest.fn().mockImplementation(({ data }) =>
        Promise.resolve({ ...meeting, ...data }),
      ),
      findMany:  jest.fn().mockResolvedValue([meeting]),
    },
    document: {
      create:   jest.fn().mockImplementation(({ data }) =>
        Promise.resolve({ id: 'cert-doc-001', ...data }),
      ),
      findFirst: jest.fn().mockResolvedValue({
        id: DOC_ID,
        signatureHash: MINUTES_HASH,
        meeting: {
          minutes: { content: MINUTES_CONTENT },
        },
      }),
      findMany: jest.fn().mockResolvedValue([]),
    },
  };
}

const mockDocumentService = {
  generateCertifiedCopy: jest.fn().mockResolvedValue({
    s3Url: 'https://s3.example.com/certified/copy.pdf',
    s3Key: 'certified/copy.pdf',
  }),
};

const mockAuditService = {
  log: jest.fn().mockResolvedValue(undefined),
};

// ── Test suite ────────────────────────────────────────────────────────────────

describe('ArchiveService', () => {
  let service: ArchiveService;
  let prismaMock: ReturnType<typeof buildPrismaMock>;

  async function buildModule(meetingOverrides = {}) {
    prismaMock = buildPrismaMock(meetingOverrides);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ArchiveService,
        { provide: PrismaService,   useValue: prismaMock },
        { provide: DocumentService, useValue: mockDocumentService },
        { provide: AuditService,    useValue: mockAuditService },
      ],
    }).compile();
    service = module.get(ArchiveService);
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── listArchive ─────────────────────────────────────────────────────────────

  describe('listArchive', () => {
    it('returns SIGNED and LOCKED meetings with metadata', async () => {
      await buildModule();
      const result = await service.listArchive(COMPANY_ID);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(MEETING_ID);
      expect(result[0].signatureHash).toBe(MINUTES_HASH);
    });

    it('queries only SIGNED and LOCKED statuses', async () => {
      await buildModule();
      await service.listArchive(COMPANY_ID);
      expect(prismaMock.meeting.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { companyId: COMPANY_ID, status: { in: ['SIGNED', 'LOCKED'] } },
        }),
      );
    });
  });

  // ── lockMeeting ─────────────────────────────────────────────────────────────

  describe('lockMeeting', () => {
    it('locks a SIGNED meeting successfully', async () => {
      await buildModule();
      const result = await service.lockMeeting(COMPANY_ID, MEETING_ID, ACTOR_ID);
      expect(prismaMock.meeting.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'LOCKED' } }),
      );
      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'MEETING_LOCKED', entityId: MEETING_ID }),
      );
    });

    it('throws NotFoundException when meeting does not exist', async () => {
      await buildModule();
      prismaMock.meeting.findFirst.mockResolvedValue(null);
      await expect(service.lockMeeting(COMPANY_ID, 'bad-id', ACTOR_ID))
        .rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException if meeting is not SIGNED', async () => {
      await buildModule({ status: 'VOTING' });
      await expect(service.lockMeeting(COMPANY_ID, MEETING_ID, ACTOR_ID))
        .rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException if minutes have no signature hash', async () => {
      await buildModule({ minutes: { content: MINUTES_CONTENT, signatureHash: null } });
      await expect(service.lockMeeting(COMPANY_ID, MEETING_ID, ACTOR_ID))
        .rejects.toThrow(BadRequestException);
    });
  });

  // ── issueCertifiedCopy ──────────────────────────────────────────────────────

  describe('issueCertifiedCopy', () => {
    it('generates a certified copy and records it', async () => {
      await buildModule();
      const result = await service.issueCertifiedCopy(COMPANY_ID, MEETING_ID, ACTOR_ID);
      expect(mockDocumentService.generateCertifiedCopy).toHaveBeenCalledWith(
        COMPANY_ID, MEETING_ID, MINUTES_CONTENT, ACTOR_ID,
      );
      expect(prismaMock.document.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            isCertifiedCopy: true,
            parentDocumentId: DOC_ID,
          }),
        }),
      );
      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'CERTIFIED_COPY_ISSUED' }),
      );
    });

    it('stores a correct SHA-256 hash on the certified copy', async () => {
      await buildModule();
      await service.issueCertifiedCopy(COMPANY_ID, MEETING_ID, ACTOR_ID);
      const createCall = prismaMock.document.create.mock.calls[0][0];
      expect(createCall.data.signatureHash).toBe(MINUTES_HASH);
    });

    it('throws BadRequestException if meeting is not SIGNED or LOCKED', async () => {
      await buildModule({ status: 'DRAFT' });
      await expect(service.issueCertifiedCopy(COMPANY_ID, MEETING_ID, ACTOR_ID))
        .rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException if no minutes exist', async () => {
      await buildModule({ minutes: null });
      await expect(service.issueCertifiedCopy(COMPANY_ID, MEETING_ID, ACTOR_ID))
        .rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException if meeting not found', async () => {
      await buildModule();
      prismaMock.meeting.findFirst.mockResolvedValue(null);
      await expect(service.issueCertifiedCopy(COMPANY_ID, 'bad-id', ACTOR_ID))
        .rejects.toThrow(NotFoundException);
    });
  });

  // ── verifyDocument ──────────────────────────────────────────────────────────

  describe('verifyDocument', () => {
    it('returns verified: true when hashes match', async () => {
      await buildModule();
      const result = await service.verifyDocument(COMPANY_ID, DOC_ID);
      expect(result.verified).toBe(true);
      expect(result.storedHash).toBe(MINUTES_HASH);
      expect(result.computedHash).toBe(MINUTES_HASH);
    });

    it('returns verified: false when stored hash does not match content', async () => {
      await buildModule();
      prismaMock.document.findFirst.mockResolvedValue({
        id: DOC_ID,
        signatureHash: 'tampered-hash-value',
        meeting: { minutes: { content: MINUTES_CONTENT } },
      });
      const result = await service.verifyDocument(COMPANY_ID, DOC_ID);
      expect(result.verified).toBe(false);
      expect(result.reason).toMatch(/tampered/i);
    });

    it('returns verified: false when no signature hash is stored', async () => {
      await buildModule();
      prismaMock.document.findFirst.mockResolvedValue({
        id: DOC_ID,
        signatureHash: null,
        meeting: { minutes: { content: MINUTES_CONTENT } },
      });
      const result = await service.verifyDocument(COMPANY_ID, DOC_ID);
      expect(result.verified).toBe(false);
    });

    it('throws NotFoundException when document does not exist', async () => {
      await buildModule();
      prismaMock.document.findFirst.mockResolvedValue(null);
      await expect(service.verifyDocument(COMPANY_ID, 'bad-id'))
        .rejects.toThrow(NotFoundException);
    });
  });
});
