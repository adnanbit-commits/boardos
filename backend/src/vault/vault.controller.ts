import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, Query, Req, Res, UseGuards, UseInterceptors,
  UploadedFile, HttpCode, BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Response } from 'express';
import { VaultService } from './vault.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequireRole } from '../company/decorators/require-role.decorator';

// multer config — keep files in memory, 20 MB limit
const upload = { storage: memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } };

// ── Company Statutory Vault ───────────────────────────────────────────────────

@Controller('companies/:companyId/vault')
@UseGuards(JwtAuthGuard)
export class VaultController {
  constructor(private readonly vault: VaultService) {}

  @Get()
  getVaultDocuments(@Param('companyId') companyId: string) {
    return this.vault.getVaultDocuments(companyId);
  }

  @Post('upload')
  @UseInterceptors(FileInterceptor('file', upload))
  async uploadDocument(
    @Param('companyId') companyId: string,
    @Req() req: any,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { docType: string; label: string },
  ) {
    if (!file) throw new BadRequestException('No file provided');
    return this.vault.uploadVaultDocument(companyId, req.user.userId, file, body.docType, body.label);
  }

  @Delete(':docId')
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
  getComplianceDocs(@Param('companyId') companyId: string, @Query('fy') fy?: string) {
    return this.vault.getComplianceDocs(companyId, fy);
  }

  @Post('upload')
  @UseInterceptors(FileInterceptor('file', upload))
  async uploadComplianceDoc(
    @Param('companyId') companyId: string,
    @Req() req: any,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { userId: string; formType: string; financialYear?: string; notes?: string },
  ) {
    if (!file) throw new BadRequestException('No file provided');
    return this.vault.uploadComplianceDoc(companyId, req.user.userId, file, body);
  }

  @Post('record')
  recordComplianceDoc(
    @Param('companyId') companyId: string,
    @Req() req: any,
    @Body() body: { userId: string; formType: string; financialYear?: string; notes?: string },
  ) {
    // Record without a file (mark as received physically, etc.)
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

// ── Meeting Documents ─────────────────────────────────────────────────────────

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

  @Post('upload')
  @UseInterceptors(FileInterceptor('file', upload))
  async uploadMeetingDoc(
    @Param('companyId') companyId: string,
    @Param('meetingId') meetingId: string,
    @Req() req: any,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { title: string; docType: string; isShared?: string },
  ) {
    if (!file) throw new BadRequestException('No file provided');
    return this.vault.uploadMeetingDocument(
      companyId, meetingId, req.user.userId, file,
      body.title, body.docType, body.isShared === 'true',
    );
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

// ── Share Link ────────────────────────────────────────────────────────────────

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

// ── Chairperson Doc Notes ─────────────────────────────────────────────────────

@Controller('companies/:companyId/meetings/:meetingId/doc-notes')
@UseGuards(JwtAuthGuard)
export class DocNotesController {
  constructor(private readonly vault: VaultService) {}

  @Get()
  getDocNotes(@Param('companyId') companyId: string, @Param('meetingId') meetingId: string) {
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
