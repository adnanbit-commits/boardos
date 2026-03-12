// src/notification/notification.controller.ts
import { Controller, Get, Patch, Param, Req, UseGuards, Query } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { NotificationService } from './notification.service';

@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  /** List notifications for the authenticated user */
  @Get()
  list(@Req() req: any, @Query('limit') limit?: string) {
    return this.notificationService.listForUser(req.user.userId, limit ? parseInt(limit) : 30);
  }

  /** Mark a single notification as read */
  @Patch(':id/read')
  markRead(@Param('id') id: string, @Req() req: any) {
    return this.notificationService.markRead(id, req.user.userId);
  }

  /** Mark all notifications as read */
  @Patch('read-all')
  markAllRead(@Req() req: any) {
    return this.notificationService.markAllRead(req.user.userId);
  }
}
