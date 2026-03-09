import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import * as https from 'https';

async function sendViaResend(to: string, subject: string, html: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.log(`[EMAIL STUB] To: ${to} | Subject: ${subject}`);
    return;
  }
  const payload = JSON.stringify({
    from: 'BoardOS <onboarding@resend.dev>',
    to, subject, html,
  });
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.resend.com',
      path: '/emails',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          resolve();
        } else {
          reject(new Error(`Resend API ${res.statusCode}: ${data}`));
        }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

@Processor('notifications')
export class NotificationProcessor extends WorkerHost {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(job: Job) {
    const { notificationId, userId, toEmail, subject, body } = job.data;
    try {
      let recipientEmail = toEmail as string | null;
      if (!recipientEmail) {
        const user = await this.prisma.user.findUnique({
          where: { id: userId },
          select: { email: true },
        });
        if (!user) throw new Error(`User ${userId} not found`);
        recipientEmail = user.email;
      }
      const html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:40px 20px;"><div style="margin-bottom:32px;"><span style="background:#2563EB;color:white;font-weight:800;font-size:14px;padding:6px 12px;border-radius:6px;">BoardOS</span></div><h2 style="color:#111827;font-size:22px;margin-bottom:16px;">${subject}</h2><div style="color:#374151;font-size:15px;line-height:1.7;white-space:pre-line;">${body}</div><hr style="border:none;border-top:1px solid #E5E7EB;margin:32px 0;"/><p style="color:#9CA3AF;font-size:12px;">BoardOS</p></div>`;
      await sendViaResend(recipientEmail, subject, html);
      await this.prisma.notification.update({
        where: { id: notificationId },
        data: { status: 'SENT', sentAt: new Date() },
      });
    } catch (err) {
      await this.prisma.notification.update({
        where: { id: notificationId },
        data: { status: 'FAILED' },
      });
      throw err;
    }
  }
}
