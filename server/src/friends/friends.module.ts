import { Module } from '@nestjs/common';
import { RankingsModule } from '../rankings/rankings.module.js';
import {
  BlocksController,
  FriendsController,
  UsersController,
} from './friends.controller.js';
import { FriendsService } from './friends.service.js';

@Module({
  imports: [RankingsModule],
  controllers: [FriendsController, UsersController, BlocksController],
  providers: [FriendsService],
})
export class FriendsModule {}
