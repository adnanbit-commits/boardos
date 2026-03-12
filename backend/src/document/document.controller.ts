import {
  Controller, Get, Post, Param, UseGuards, Request,
} from '@nestjs/common';
import { JwtAuthGuard }    from '../auth/jwt-auth.guard';
import { CompanyGuard }    from '../company/guards/company.guard';
import { RequireRole, RequireWorkspaceAdmin }     from '../company/decorators/require-role.decorator';
import { DocumentService } from './document.service';

@Controller('companies/:companyId')
@UseGuards(JwtAuthGuard, CompanyGuard)
export class DocumentController {
  constructor(private readonly documents: DocumentService) {}

  // Any member can list documents
  @Get('documents')
  listDocuments(@Param('companyId') companyId: string) {
    return this.documents.listByCompany(companyId);
  }

  // Any member can export minutes
  @Post('meetings/:meetingId/minutes/export')
  // Any member can export minutes
  exportMinutesPdf(
    @Param('companyId') companyId: string,
    @Param('meetingId') meetingId: string,
    @Request() req: any,
  ) {
    return this.documents.generateMinutesPdf(companyId, meetingId, req.user.userId);
  }

  // Certify resolution copy stays ADMIN only — legal document, higher stakes
  @Post('resolutions/:resolutionId/certify')
  @RequireWorkspaceAdmin()
  certifyResolution(
    @Param('companyId')    companyId:    string,
    @Param('resolutionId') resolutionId: string,
    @Request() req: any,
  ) {
    return this.documents.generateCertifiedCopy(companyId, resolutionId, req.user.userId);
  }
}
