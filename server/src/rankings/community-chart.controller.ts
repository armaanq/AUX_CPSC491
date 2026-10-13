import { Controller, Get, Query } from '@nestjs/common';
import {
  RankingsService,
  type CommunityChartResponse,
  type SongStats,
} from './rankings.service.js';

@Controller('charts')
export class CommunityChartController {
  constructor(private readonly rankings: RankingsService) {}

  /**
   * GET /charts/community — the songs AUX users rank highest.
   * Optional: ?genre=hip-hop (see COMMUNITY_GENRES) and ?limit=100 (default 50).
   */
  @Get('community')
  community(
    @Query('genre') genre?: string,
    @Query('limit') limit?: string,
  ): Promise<CommunityChartResponse> {
    return this.rankings.community({ genre, limit });
  }

  /** GET /charts/community/songs?ids=<songId>,<songId> — each song's AUX average and listener count. */
  @Get('community/songs')
  songs(@Query('ids') ids?: string): Promise<{ stats: SongStats[] }> {
    return this.rankings.songStats(ids);
  }
}
