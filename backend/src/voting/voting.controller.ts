
import { Controller, Post, Get, Param, Body, UseGuards, Req } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { VotingService } from './voting.service';
import { CastVoteDto } from './dto/cast-vote.dto';

@UseGuards(JwtAuthGuard)
@Controller('companies/:companyId/resolutions/:resolutionId/votes')
export class VotingController {
  constructor(private readonly votingService: VotingService) {}

  // GET — returns current tally for a resolution
  @Get()
  getTally(
    @Param('companyId') companyId: string,
    @Param('resolutionId') resolutionId: string,
  ) {
    return this.votingService.getTally(companyId, resolutionId);
  }

  // POST — cast or update a vote
  @Post()
  castVote(
    @Param('companyId') companyId: string,
    @Param('resolutionId') resolutionId: string,
    @Body() dto: CastVoteDto,
    @Req() req: any,
  ) {
    return this.votingService.castVote(companyId, resolutionId, dto, req.user.userId);
  }
}


