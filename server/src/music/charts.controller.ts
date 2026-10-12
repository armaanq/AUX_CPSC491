import { Controller, Get, Query } from '@nestjs/common';
import { SongsService, type ChartsResponse } from './songs.service.js';

@Controller('charts')
export class ChartsController {
  constructor(private readonly songs: SongsService) {}

  /** GET /charts or /charts?genre=18 (Hip-Hop/Rap): Apple Music's most-played songs and albums */
  @Get()
  charts(@Query('genre') genre?: string): Promise<ChartsResponse> {
    return this.songs.charts(genre);
  }
}
