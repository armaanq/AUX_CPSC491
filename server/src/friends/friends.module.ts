import { Module } from '@nestjs/common';
import { RankingsModule } from '../rankings/rankings.module.js';
import { FriendsController, UsersController } from './friends.controller.js';
import { FriendsService } from './friends.service.js';

@Module({
  imports: [RankingsModule],
  controllers: [FriendsController, UsersController],
  providers: [FriendsService],
})
export class FriendsModule {}
