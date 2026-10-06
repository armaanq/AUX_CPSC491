import { Module } from '@nestjs/common';
import { MusicBrainzClient } from './musicbrainz/musicbrainz.client.js';
import { SongsController } from './songs.controller.js';
import { SongsService } from './songs.service.js';

@Module({
  controllers: [SongsController],
  // MusicBrainzClient must stay a single instance: it owns the 1 req/s limiter.
  providers: [SongsService, MusicBrainzClient],
  exports: [SongsService, MusicBrainzClient],
})
export class SongsModule {}
