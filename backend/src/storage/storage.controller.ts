import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { StorageService } from './storage.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('storage')
@UseGuards(JwtAuthGuard)
export class StorageController {
  constructor(private readonly storage: StorageService) {}

  @Get('download')
  async download(@Query('path') objectPath: string, @Res() res: Response) {
    if (!objectPath) { res.status(400).json({ message: 'path is required' }); return; }

    try {
      const stream = await this.storage.getReadStream(objectPath);
      const filename = objectPath.split('/').pop() ?? 'file';

      res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
      res.setHeader('Cache-Control', 'private, max-age=300');
      stream.pipe(res);

      stream.on('error', () => {
        if (!res.headersSent) res.status(404).json({ message: 'File not found' });
      });
    } catch {
      res.status(500).json({ message: 'Download failed' });
    }
  }
}
