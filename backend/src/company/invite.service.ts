// src/company/invite.service.ts
//
// Full invite lifecycle:
//   Admin sends invite → token stored in DB → email sent →
//   Invitee clicks link → accepts via API → CompanyUser record created
//
// Works for both existing users and new sign-ups (token is the bridge).

import {
  Injectable,
  NotFoundException,
  ConflictException,
  GoneException,
  BadRequestException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationService } from '../notification/notification.service';
import { InviteDirectorDto } from './dto/invite-director.dto';
import { UserRole } from '@prisma/client';

@Injectable()
export class InviteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notification: NotificationService,
  ) {}

  /**
   * Send an invite to an email address.
   *
   * If the email already belongs to a registered user, we still send a token —
   * the acceptance endpoint handles both cases (existing vs new user).
   *
   * Idempotent: re-inviting the same email refreshes the token and resends.
   */
  async sendInvite(companyId: string, dto: InviteDirectorDto, invitedById: string) {
    const company = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (!company) throw new NotFoundException('Company not found');

    // Block if they're already a member
    const existingUser = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existingUser) {
      const alreadyMember = await this.prisma.companyUser.findUnique({
        where: { userId_companyId: { userId: existingUser.id, companyId } },
      });
      if (alreadyMember) {
        throw new ConflictException(`${dto.email} is already a member of this company`);
      }
    }

    // Generate a cryptographically secure token (64 hex chars)
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    // Upsert — re-invite refreshes the token
    const invitation = await this.prisma.invitation.upsert({
      where: { companyId_email: { companyId, email: dto.email } },
      create: {
        companyId,
        email: dto.email,
        role: dto.role as UserRole,
        token,
        invitedById,
        expiresAt,
      },
      update: {
        role: dto.role as UserRole,
        token,
        invitedById,
        expiresAt,
        acceptedAt: null, // Reset if re-inviting
      },
    });

    // Build the magic link pointing to the frontend
    const inviteUrl = `${process.env.FRONTEND_URL}/invite/${token}`;

    // Queue the email — non-blocking
    await this.notification.send({
      userId: existingUser?.id ?? invitedById,
      toEmail: existingUser ? undefined : dto.email, // Direct email for users with no account yet
      companyId,
      type: 'MEETING_INVITE',
      subject: `You've been invited to join ${company.name} on SafeMinutes`,
      body: this.buildInviteEmailBody({
        companyName: company.name,
        role: dto.role,
        inviteUrl,
        email: dto.email,
      }),
    });

    await this.audit.log({
      companyId,
      userId: invitedById,
      action: 'DIRECTOR_INVITED',
      entity: 'Invitation',
      entityId: invitation.id,
      metadata: { email: dto.email, role: dto.role },
    });

    return {
      id: invitation.id,
      email: invitation.email,
      role: invitation.role,
      expiresAt: invitation.expiresAt,
      // Never return the raw token in the response — only sent via email
    };
  }

  /**
   * Accept an invite by token.
   * The accepting user must already be authenticated (JWT required).
   *
   * Flow:
   *  1. Validate token exists + not expired + not already accepted
   *  2. Verify the authenticated user's email matches the invite email
   *  3. Create CompanyUser record
   *  4. Mark invitation accepted
   */
  async accept(token: string, userId: string) {
    const invitation = await this.prisma.invitation.findUnique({
      where: { token },
      include: { company: true },
    });

    if (!invitation) throw new NotFoundException('Invalid or expired invite link');
    if (invitation.acceptedAt) throw new ConflictException('This invitation has already been used');
    if (invitation.expiresAt < new Date()) throw new GoneException('This invitation has expired');

    // Verify the logged-in user's email matches the invite
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    if (user.email.toLowerCase() !== invitation.email.toLowerCase()) {
      throw new BadRequestException(
        `This invite was sent to ${invitation.email}. Please log in with that account.`,
      );
    }

    // Use a transaction — membership creation and invite acceptance are atomic
    const result = await this.prisma.$transaction(async (tx) => {
      // Check they're not already a member (race condition guard)
      const existing = await tx.companyUser.findUnique({
        where: { userId_companyId: { userId, companyId: invitation.companyId } },
      });
      if (existing) throw new ConflictException('You are already a member of this company');

      const membership = await tx.companyUser.create({
        data: {
          userId,
          companyId: invitation.companyId,
          role: invitation.role,
          acceptedAt: new Date(),
        },
      });

      await tx.invitation.update({
        where: { id: invitation.id },
        data: { acceptedAt: new Date() },
      });

      return membership;
    });

    await this.audit.log({
      companyId: invitation.companyId,
      userId,
      action: 'INVITE_ACCEPTED',
      entity: 'Invitation',
      entityId: invitation.id,
      metadata: { role: invitation.role },
    });

    return {
      company: invitation.company,
      role: result.role,
    };
  }

  /** All pending (not yet accepted, not expired) invitations */
  /** Preview an invite by token — returns company + role info for the accept page */
  async preview(token: string) {
    const invite = await this.prisma.invitation.findUnique({
      where: { token },
      include: {
        company:   { select: { id: true, name: true, cin: true } },
        invitedBy: { select: { name: true } },
      },
    });

    if (!invite) throw new NotFoundException('Invite not found or already used');
    if (invite.expiresAt < new Date()) throw new GoneException('Invite has expired');
    if (invite.acceptedAt) throw new ConflictException('Invite has already been accepted');

    return {
      company:   invite.company,
      role:      invite.role,
      email:     invite.email,
      expiresAt: invite.expiresAt,
      invitedBy: invite.invitedBy,
    };
  }

  async listPending(companyId: string) {
    return this.prisma.invitation.findMany({
      where: {
        companyId,
        acceptedAt: null,
        expiresAt: { gt: new Date() },
      },
      include: {
        invitedBy: { select: { name: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Revoke a pending invitation — idempotent */
  async revoke(companyId: string, invitationId: string) {
    const invite = await this.prisma.invitation.findFirst({
      where: { id: invitationId, companyId },
    });
    if (!invite) throw new NotFoundException('Invitation not found');

    await this.prisma.invitation.delete({ where: { id: invitationId } });
  }

  // ── Email template ────────────────────────────────────────────────────────

  private buildInviteEmailBody(params: {
    companyName: string;
    role: string;
    inviteUrl: string;
    email: string;
  }): string {
    return `
      You have been invited to join ${params.companyName} on SafeMinutes
      as a ${params.role}.

      SafeMinutes is a governance platform for managing board meetings,
      resolutions, and compliance documents.

      Accept your invitation here:
      ${params.inviteUrl}

      This link expires in 7 days and can only be used by ${params.email}.

      If you did not expect this invitation, you can safely ignore this email.
    `;
  }
}
