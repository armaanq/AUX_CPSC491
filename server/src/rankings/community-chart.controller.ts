import { Controller, Get } from '@nestjs/common';
import {
  RankingsService,
  type CommunityChartResponse,
} from './rankings.service.js';

@Controller('charts')
export class CommunityChartController {
  constructor(private readonly rankings: RankingsService) {}

  /** GET /charts/community — the songs AUX users rank highest. */
  @Get('community')
  community(): Promise<CommunityChartResponse> {
    return this.rankings.community();
  }
}
