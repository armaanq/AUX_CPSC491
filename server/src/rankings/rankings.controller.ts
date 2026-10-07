import { Body, Controller, Delete, Get, Param, Put } from '@nestjs/common';
import { CurrentUserId } from '../auth/current-user.decorator.js';
import {
  RankingsService,
  type PlaceBody,
  type RankingsResponse,
} from './rankings.service.js';

@Controller('me/rankings')
export class RankingsController {
  constructor(private readonly rankings: RankingsService) {}

  /** GET /me/rankings — your rankings, best first. */
  @Get()
  list(@CurrentUserId() userId: string): Promise<RankingsResponse> {
    return this.rankings.list(userId);
  }

  /** PUT /me/rankings/:songId { sentiment, position } — add or move a song. */
  @Put(':songId')
  place(
    @CurrentUserId() userId: string,
    @Param('songId') songId: string,
    @Body() body: PlaceBody | undefined,
  ): Promise<RankingsResponse> {
    return this.rankings.place(userId, songId, body ?? {});
  }

  /** DELETE /me/rankings/:songId — take a song out of your rankings. */
  @Delete(':songId')
  remove(
    @CurrentUserId() userId: string,
    @Param('songId') songId: string,
  ): Promise<RankingsResponse> {
    return this.rankings.remove(userId, songId);
  }
}
