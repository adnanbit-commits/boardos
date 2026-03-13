import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, Query, Req, UseGuards, HttpCode,
} from '@nestjs/common';
import { VaultService } from './vault.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequireRole } from '../company/decorators/require-role.decorator';

// ── Company Statutory Vault ───────────────────────────────────────────────────

@Controller('companies/:companyId/vault')
@UseGuards(JwtAuthGuard)
export class VaultController {
  constructor(private readonly vault: VaultService) {}

  @Get()
  getVaultDocuments(@Param('companyId') companyId: string) {
    return this.vault.getVaultDocuments(companyId);
  }

  @Post('upload-url')
  getUploadUrl(
    @Param('companyId') companyId: string,
    @Body() body: { fileName: string; contentType: string },
  ) {
    return this.vault.getVaultUploadUrl(companyId, body.fileName, body.contentType);
  }

  @Post()
  registerDocument(
    @Param('companyId') companyId: string,
    @Req() req: any,
    @Body() body: { docType: string; label: string; objectPath: string; fileName: string; fileSize?: number },
  ) {
    return this.vault.registerVaultDocument(companyId, req.user.userId, body);
  }

  @Delete(':docId')
  @RequireRole('DIRECTOR')
  @HttpCode(204)
  deleteDocument(
    @Param('companyId') companyId: string,
    @Param('docId') docId: string,
    @Req() req: any,
  ) {
    return this.vault.deleteVaultDocument(companyId, docId, req.user.userId);
  }
}

// ── Director Compliance Register ──────────────────────────────────────────────

@Controller('companies/:companyId/compliance')
@UseGuards(JwtAuthGuard)
export class ComplianceController {
  constructor(private readonly vault: VaultService) {}

  @Get()
  getComplianceDocs(
    @Param('companyId') companyId: string,
    @Query('fy') fy?: string,
  ) {
    return this.vault.getComplianceDocs(companyId, fy);
  }

  @Post('upload-url')
  getUploadUrl(
    @Param('companyId') companyId: string,
    @Body() body: { fileName: string; contentType: string },
  ) {
    return this.vault.getComplianceUploadUrl(companyId, body.fileName, body.contentType);
  }

  @Post()
  registerComplianceDoc(
    @Param('companyId') companyId: string,
    @Req() req: any,
    @Body() body: {
      userId: string; formType: string; financialYear?: string;
      objectPath?: string; fileName?: string; fileSize?: number; notes?: string;
    },
  ) {
    return this.vault.registerComplianceDoc(companyId, req.user.userId, body);
  }

  @Patch(':docId/received')
  markReceived(
    @Param('companyId') companyId: string,
    @Param('docId') docId: string,
    @Req() req: any,
    @Body() body: { received: boolean; notes?: string },
  ) {
    return this.vault.markComplianceReceived(companyId, docId, req.user.userId, body.received, body.notes);
  }
}

// ── Meeting Documents + Share Link ────────────────────────────────────────────

@Controller('companies/:companyId/meetings/:meetingId/documents')
@UseGuards(JwtAuthGuard)
export class MeetingDocController {
  constructor(private readonly vault: VaultService) {}

  @Get()
  getMeetingDocs(
    @Param('companyId') companyId: string,
    @Param('meetingId') meetingId: string,
  ) {
    return this.vault.getMeetingDocuments(companyId, meetingId);
  }

  @Post('upload-url')
  getUploadUrl(
    @Param('companyId') companyId: string,
    @Body() body: { fileName: string; contentType: string },
  ) {
    return this.vault.getMeetingDocUploadUrl(companyId, body.fileName, body.contentType);
  }

  @Post()
  registerDocument(
    @Param('companyId') companyId: string,
    @Param('meetingId') meetingId: string,
    @Req() req: any,
    @Body() body: { title: string; docType: string; objectPath: string; fileName: string; fileSize?: number; isShared?: boolean },
  ) {
    return this.vault.registerMeetingDocument(companyId, meetingId, req.user.userId, body);
  }

  @Patch(':docId/shared')
  toggleShared(
    @Param('companyId') companyId: string,
    @Param('docId') docId: string,
    @Body() body: { isShared: boolean },
  ) {
    return this.vault.toggleMeetingDocShared(companyId, docId, body.isShared);
  }

  @Delete(':docId')
  @HttpCode(204)
  deleteDocument(@Param('companyId') companyId: string, @Param('docId') docId: string) {
    return this.vault.deleteMeetingDocument(companyId, docId);
  }
}

@Controller('companies/:companyId/meetings/:meetingId/share')
@UseGuards(JwtAuthGuard)
export class MeetingShareController {
  constructor(private readonly vault: VaultService) {}

  @Post()
  getOrCreateShare(
    @Param('companyId') companyId: string,
    @Param('meetingId') meetingId: string,
    @Req() req: any,
  ) {
    return this.vault.getOrCreateShareLink(companyId, meetingId, req.user.userId);
  }

  @Delete()
  @HttpCode(204)
  deactivateShare(@Param('companyId') companyId: string, @Param('meetingId') meetingId: string) {
    return this.vault.deactivateShareLink(companyId, meetingId);
  }
}

// ── Chairperson Document Noting ───────────────────────────────────────────────

@Controller('companies/:companyId/meetings/:meetingId/doc-notes')
@UseGuards(JwtAuthGuard)
export class DocNotesController {
  constructor(private readonly vault: VaultService) {}

  @Get()
  getDocNotes(
    @Param('companyId') companyId: string,
    @Param('meetingId') meetingId: string,
  ) {
    return this.vault.getDocNotes(companyId, meetingId);
  }

  @Post()
  noteDocument(
    @Param('companyId') companyId: string,
    @Param('meetingId') meetingId: string,
    @Req() req: any,
    @Body() body: { directorUserId: string; formType: string; status: 'NOTED' | 'NOTED_WITH_EXCEPTION'; exception?: string },
  ) {
    return this.vault.noteDocument(companyId, meetingId, req.user.userId, body);
  }
}
