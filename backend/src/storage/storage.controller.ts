import { Controller, Get, Query, Req, Res, UseGuards, UnauthorizedException } from '@nestjs/common';
import { Response, Request } from 'express';
import { StorageService } from './storage.service';
import { JwtService } from '@nestjs/jwt';

@Controller('storage')
export class StorageController {
  constructor(
    private readonly storage: StorageService,
    private readonly jwt: JwtService,
  ) {}

  @Get('download')
  async download(
    @Query('path') objectPath: string,
    @Query('token') queryToken: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    if (!objectPath) { res.status(400).json({ message: 'path is required' }); return; }

    // Accept JWT from Authorization header OR ?token= query param (for browser tab opens)
    const bearerToken = (req.headers['authorization'] as string)?.replace('Bearer ', '');
    const token = bearerToken || queryToken;
    if (!token) { res.status(401).json({ message: 'Unauthorized' }); return; }

    try {
      this.jwt.verify(token);
    } catch {
      res.status(401).json({ message: 'Unauthorized' }); return;
    }

    try {
      const stream = await this.storage.getReadStream(objectPath);
      const filename = objectPath.split('/').pop() ?? 'file';
      res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
      res.setHeader('Cache-Control', 'private, max-age=300');
      stream.pipe(res);
      stream.on('error', () => { if (!res.headersSent) res.status(404).json({ message: 'File not found' }); });
    } catch {
      res.status(500).json({ message: 'Download failed' });
    }
  }
}
