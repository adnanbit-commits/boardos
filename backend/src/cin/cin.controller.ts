// src/cin/cin.controller.ts

import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CinService } from './cin.service';

@UseGuards(JwtAuthGuard)
@Controller('cin')
export class CinController {
  constructor(private readonly cinService: CinService) {}

  /**
   * GET /cin/lookup?cin=U12345MH2024PTC000000
   * Returns company master data + director list from MCA via Sandbox API.
   * Requires auth — only logged-in users can look up CIN data.
   */
  @Get('lookup')
  lookup(@Query('cin') cin: string) {
    return this.cinService.lookup(cin);
  }
}
