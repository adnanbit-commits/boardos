import {
  Injectable, NotFoundException, ForbiddenException, BadRequestException,
} from '@nestjs/common';
import { VoteValue, ResolutionStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CastVoteDto } from './dto/cast-vote.dto';

@Injectable()
export class VotingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async getTally(companyId: string, resolutionId: string) {
    const resolution = await this.getResolution(companyId, resolutionId);
    const votes = await this.prisma.vote.findMany({
      where: { resolutionId },
      include: { user: { select: { id: true, name: true } } },
    });

    // Count director seats for the company
    const directorCount = await this.prisma.companyUser.count({
      where: { companyId, role: { in: ['ADMIN', 'DIRECTOR'] } },
    });

    const tally = {
      APPROVE: 0,
      REJECT: 0,
      ABSTAIN: 0,
    };
    votes.forEach(v => tally[v.value]++);

    const voted = votes.length;
    const pending = directorCount - voted;

    // Simple majority: more than half of total directors approve
    const majority = tally.APPROVE > directorCount / 2;

    return {
      resolution: { id: resolution.id, title: resolution.title, status: resolution.status },
      tally,
      directorCount,
      voted,
      pending,
      majority,
      votes: votes.map(v => ({ director: v.user.name, vote: v.value, castAt: v.createdAt })),
    };
  }

  async castVote(
    companyId: string,
    resolutionId: string,
    dto: CastVoteDto,
    userId: string,
  ) {
    const resolution = await this.getResolution(companyId, resolutionId);

    // Only allow voting when resolution is in VOTING status
    if (resolution.status !== ResolutionStatus.VOTING) {
      throw new BadRequestException('Resolution is not open for voting');
    }

    // Confirm user is a director of this company
    const membership = await this.prisma.companyUser.findUnique({
      where: { userId_companyId: { userId, companyId } },
    });
    if (!membership) throw new ForbiddenException('Not a member of this company');

    // Upsert: replace previous vote if director changes their mind
    const vote = await this.prisma.vote.upsert({
      where: { resolutionId_userId: { resolutionId, userId } },
      create: { resolutionId, userId, value: dto.value as VoteValue, remarks: dto.remarks },
      update: { value: dto.value as VoteValue, remarks: dto.remarks },
    });

    await this.audit.log({
      companyId,
      userId,
      action: 'VOTE_CAST',
      entity: 'Resolution',
      entityId: resolutionId,
      metadata: { vote: dto.value },
    });

    // Check if all directors have voted — auto-finalize if so
    await this.checkAndFinalizeResolution(companyId, resolutionId);

    return vote;
  }

  // Automatically marks a resolution APPROVED or REJECTED when all votes are in
  private async checkAndFinalizeResolution(companyId: string, resolutionId: string) {
    const directorCount = await this.prisma.companyUser.count({
      where: { companyId, role: { in: ['ADMIN', 'DIRECTOR'] } },
    });

    const voteCount = await this.prisma.vote.count({ where: { resolutionId } });

    if (voteCount < directorCount) return; // Still pending votes

    const approveCount = await this.prisma.vote.count({
      where: { resolutionId, value: VoteValue.APPROVE },
    });

    const newStatus = approveCount > directorCount / 2
      ? ResolutionStatus.APPROVED
      : ResolutionStatus.REJECTED;

    await this.prisma.resolution.update({
      where: { id: resolutionId },
      data: { status: newStatus },
    });
  }

  private async getResolution(companyId: string, resolutionId: string) {
    const resolution = await this.prisma.resolution.findFirst({
      where: { id: resolutionId, companyId },
    });
    if (!resolution) throw new NotFoundException('Resolution not found');
    return resolution;
  }
}
