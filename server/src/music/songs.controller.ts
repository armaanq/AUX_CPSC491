import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import { SongsService, type SearchResponse } from './songs.service.js';

@Controller('songs')
export class SongsController {
  constructor(private readonly songs: SongsService) {}

  /** GET /songs/search?q=frank%20ocean%20ivy */
  @Get('search')
  search(@Query('q') q?: string): Promise<SearchResponse> {
    return this.songs.search(typeof q === 'string' ? q : undefined);
  }

  /** POST /songs/resolve { source: "musicbrainz", externalId: "<recording mbid>" } */
  @Post('resolve')
  @HttpCode(200)
  resolve(@Body() body: { source?: unknown; externalId?: unknown } | undefined): Promise<{ id: string }> {
    return this.songs.resolve(body?.source, body?.externalId);
  }
}
