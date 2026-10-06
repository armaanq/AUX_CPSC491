import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { SongsModule } from './music/songs.module.js';
import { PrismaModule } from './prisma/prisma.module.js';

@Module({
  imports: [PrismaModule, SongsModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
