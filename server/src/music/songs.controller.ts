import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import { SongsService, type PreviewResponse, type SearchResponse } from './songs.service.js';

@Controller('songs')
export class SongsController {
  constructor(private readonly songs: SongsService) {}

  /** GET /songs/search?q=frank%20ocean%20ivy */
  @Get('search')
  search(@Query('q') q?: string): Promise<SearchResponse> {
    return this.songs.search(typeof q === 'string' ? q : undefined);
  }

  /** GET /songs/preview?source=apple&externalId=1146195713 (or ?isrc=USUM71607007 for other catalogs) */
  @Get('preview')
  preview(
    @Query('source') source?: string,
    @Query('externalId') externalId?: string,
    @Query('isrc') isrc?: string,
  ): Promise<PreviewResponse> {
    return this.songs.preview(source, externalId, isrc);
  }

  /** POST /songs/resolve { source: "apple", externalId: "1146195713" } (or "musicbrainz" + a recording mbid) */
  @Post('resolve')
  @HttpCode(200)
  resolve(@Body() body: { source?: unknown; externalId?: unknown } | undefined): Promise<{ id: string }> {
    return this.songs.resolve(body?.source, body?.externalId);
  }
}
