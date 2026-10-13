import { Module } from '@nestjs/common';
import { AlbumsController } from './albums.controller.js';
import { AppleMusicClient } from './apple/apple-music.client.js';
import { ChartsController } from './charts.controller.js';
import { PlaylistsController } from './playlists/playlists.controller.js';
import { SpotifyEmbedClient } from './playlists/spotify-embed.js';
import { MusicBrainzClient } from './musicbrainz/musicbrainz.client.js';
import { SongsController } from './songs.controller.js';
import { SongsService } from './songs.service.js';

@Module({
  controllers: [SongsController, AlbumsController, ChartsController, PlaylistsController],
  // MusicBrainzClient must stay a single instance: it owns the 1 req/s limiter.
  // AppleMusicClient too: it signs and reuses one developer token.
  providers: [SongsService, MusicBrainzClient, AppleMusicClient, SpotifyEmbedClient],
  exports: [SongsService, MusicBrainzClient],
})
export class SongsModule {}
