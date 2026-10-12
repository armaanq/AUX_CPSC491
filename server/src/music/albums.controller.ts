import { Controller, Get, Param } from '@nestjs/common';
import { SongsService, type AlbumResponse } from './songs.service.js';

@Controller('albums')
export class AlbumsController {
  constructor(private readonly songs: SongsService) {}

  /** GET /albums/apple/1146195596: the album and its tracklist */
  @Get(':source/:id')
  album(@Param('source') source: string, @Param('id') id: string): Promise<AlbumResponse> {
    return this.songs.album(source, id);
  }
}
