import { Controller, Get, Param } from '@nestjs/common';
import { VaultService } from '../vault/vault.service';

// No JwtAuthGuard — this is publicly accessible via share token
@Controller('public/meeting')
export class PublicMeetingController {
  constructor(private readonly vault: VaultService) {}

  @Get(':shareToken')
  getMeetingPapers(@Param('shareToken') shareToken: string) {
    return this.vault.getPublicMeetingPapers(shareToken);
  }
}
