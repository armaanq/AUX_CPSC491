import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { SongsService, type PlaylistImportResponse } from '../songs.service.js';

@Controller('playlists')
export class PlaylistsController {
  constructor(private readonly songs: SongsService) {}

  /** POST /playlists/import { url: "https://music.apple.com/us/playlist/…/pl.u-…" } (or an open.spotify.com link) */
  @Post('import')
  @HttpCode(200)
  import(@Body() body: { url?: unknown } | undefined): Promise<PlaylistImportResponse> {
    return this.songs.importPlaylist(body?.url);
  }
}
