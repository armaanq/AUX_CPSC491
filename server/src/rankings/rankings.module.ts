import { Module } from '@nestjs/common';
import { CommunityChartController } from './community-chart.controller.js';
import { RankingsController } from './rankings.controller.js';
import { RankingsService } from './rankings.service.js';

@Module({
  controllers: [RankingsController, CommunityChartController],
  providers: [RankingsService],
  // Friends' profiles show their rankings.
  exports: [RankingsService],
})
export class RankingsModule {}
