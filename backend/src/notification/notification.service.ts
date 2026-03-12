import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';

export interface SendNotificationParams {
  userId: string;
  toEmail?: string; // Override — use when recipient has no account yet
  companyId?: string;
  type: 'MEETING_INVITE' | 'VOTE_REQUEST' | 'SIGNATURE_REQUEST' | 'MINUTES_READY' | 'GENERAL';
  subject: string;
  body: string;
}

@Injectable()
export class NotificationService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('notifications') private readonly queue: Queue,
  ) {}

  async send(params: SendNotificationParams) {
    const notification = await this.prisma.notification.create({
      data: {
        userId:    params.userId,
        companyId: params.companyId,
        type:      params.type,
        subject:   params.subject,
        body:      params.body,
        status:    'PENDING',
      },
    });

    await this.queue.add('send-email', {
      notificationId: notification.id,
      userId:  params.userId,
      toEmail: params.toEmail ?? null, // Pass override through to processor
      subject: params.subject,
      body:    params.body,
    }, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: true,
    });

    return notification;
  }

  async notifyDirectorsToVote(companyId: string, resolutionTitle: string, resolutionId: string) {
    const directors = await this.prisma.companyUser.findMany({
      where: { companyId, role: { in: ['DIRECTOR', 'COMPANY_SECRETARY'] } },
      include: { user: true },
    });

    const jobs = directors.map(d =>
      this.send({
        userId: d.userId,
        companyId,
        type: 'VOTE_REQUEST',
        subject: `Action Required: Vote on "${resolutionTitle}"`,
        body: `You are requested to cast your vote on the board resolution: "${resolutionTitle}". Please log in to BoardOS to vote.`,
      }),
    );

    await Promise.all(jobs);
  }
}

  async listForUser(userId: string, limit = 30) {
    return this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async markRead(notificationId: string, userId: string) {
    // We use sentAt as the "read" timestamp — no separate field needed
    return this.prisma.notification.updateMany({
      where: { id: notificationId, userId },
      data: { sentAt: new Date() },
    });
  }

  async markAllRead(userId: string) {
    return this.prisma.notification.updateMany({
      where: { userId, sentAt: null },
      data: { sentAt: new Date() },
    });
  }
