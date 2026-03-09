// backend/src/archive/archive.controller.ts

import {
  Controller,
  Get,
  Post,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import { JwtAuthGuard }    from '../auth/jwt-auth.guard';
import { CompanyGuard }    from '../company/guards/company.guard';
import { RequireRole }     from '../company/decorators/require-role.decorator';
import { ArchiveService }  from './archive.service';

@Controller('companies/:companyId')
@UseGuards(JwtAuthGuard, CompanyGuard)
export class ArchiveController {
  constructor(private readonly archive: ArchiveService) {}

  // GET /companies/:companyId/archive
  // Lists all SIGNED + LOCKED meetings with their document metadata.
  // All roles can view the archive.
  @Get('archive')
  listArchive(@Param('companyId') companyId: string) {
    return this.archive.listArchive(companyId);
  }

  // POST /companies/:companyId/archive/meetings/:meetingId/lock
  // Transitions a SIGNED meeting to LOCKED. Admin or Chairman only.
  @Post('archive/meetings/:meetingId/lock')
  @RequireRole('ADMIN')
  lockMeeting(
    @Param('companyId') companyId: string,
    @Param('meetingId') meetingId: string,
    @Request()          req:       any,
  ) {
    return this.archive.lockMeeting(companyId, meetingId, req.user.userId);
  }

  // POST /companies/:companyId/archive/meetings/:meetingId/certify
  // Issues a certified copy PDF for a signed or locked meeting.
  // Admin or Chairman only.
  @Post('archive/meetings/:meetingId/certify')
  @RequireRole('ADMIN')
  issueCertifiedCopy(
    @Param('companyId') companyId: string,
    @Param('meetingId') meetingId: string,
    @Request()          req:       any,
  ) {
    return this.archive.issueCertifiedCopy(companyId, meetingId, req.user.userId);
  }

  // GET /companies/:companyId/archive/meetings/:meetingId/copies
  // Lists all certified copies issued for a meeting.
  @Get('archive/meetings/:meetingId/copies')
  listCertifiedCopies(
    @Param('companyId') companyId: string,
    @Param('meetingId') meetingId: string,
  ) {
    return this.archive.listCertifiedCopies(companyId, meetingId);
  }

  // GET /companies/:companyId/archive/documents/:documentId/verify
  // Verifies the SHA-256 integrity of a document.
  // All roles — useful for auditors and partners.
  @Get('archive/documents/:documentId/verify')
  verifyDocument(
    @Param('companyId')  companyId:  string,
    @Param('documentId') documentId: string,
  ) {
    return this.archive.verifyDocument(companyId, documentId);
  }
}
