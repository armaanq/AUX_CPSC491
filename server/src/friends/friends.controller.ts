import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { CurrentUserId } from '../auth/current-user.decorator.js';
import {
  FriendsService,
  type BlockedUser,
  type FriendScore,
  type FriendStatus,
  type FriendsResponse,
  type ProfileResponse,
  type PublicUser,
  type ReportBody,
} from './friends.service.js';

@Controller('friends')
export class FriendsController {
  constructor(private readonly friends: FriendsService) {}

  /** GET /friends — your friends, requests waiting for you, and requests you sent. */
  @Get()
  list(@CurrentUserId() me: string): Promise<FriendsResponse> {
    return this.friends.list(me);
  }

  /** GET /friends/songs/:songId — how your friends scored a song. */
  @Get('songs/:songId')
  songScores(
    @CurrentUserId() me: string,
    @Param('songId') songId: string,
  ): Promise<{ scores: FriendScore[] }> {
    return this.friends.songScores(me, songId);
  }

  /** POST /friends/:userId — send a request, or accept theirs. */
  @Post(':userId')
  @HttpCode(200)
  add(
    @CurrentUserId() me: string,
    @Param('userId') userId: string,
  ): Promise<{ status: FriendStatus }> {
    return this.friends.request(me, userId);
  }

  /** DELETE /friends/:userId — cancel, decline, or unfriend. */
  @Delete(':userId')
  remove(
    @CurrentUserId() me: string,
    @Param('userId') userId: string,
  ): Promise<{ status: FriendStatus }> {
    return this.friends.remove(me, userId);
  }
}

@Controller('users')
export class UsersController {
  constructor(private readonly friends: FriendsService) {}

  /** GET /users?q=name — find people by username (newest listeners when q is empty). */
  @Get()
  search(
    @CurrentUserId() me: string,
    @Query('q') q?: string,
  ): Promise<{ users: PublicUser[] }> {
    return this.friends.search(me, q);
  }

  /** GET /users/:userId — anyone's profile and rankings. */
  @Get(':userId')
  profile(
    @CurrentUserId() me: string,
    @Param('userId') userId: string,
  ): Promise<ProfileResponse> {
    return this.friends.profile(me, userId);
  }

  /** POST /users/:userId/report { reason, details? } — report someone to the team. */
  @Post(':userId/report')
  @HttpCode(200)
  report(
    @CurrentUserId() me: string,
    @Param('userId') userId: string,
    @Body() body: ReportBody | undefined,
  ): Promise<{ reported: true }> {
    return this.friends.report(me, userId, body ?? {});
  }
}

@Controller('me/blocks')
export class BlocksController {
  constructor(private readonly friends: FriendsService) {}

  /** GET /me/blocks — people you've blocked. */
  @Get()
  list(@CurrentUserId() me: string): Promise<{ users: BlockedUser[] }> {
    return this.friends.blocked(me);
  }

  /** PUT /me/blocks/:userId — block someone (also ends any friendship). */
  @Put(':userId')
  block(
    @CurrentUserId() me: string,
    @Param('userId') userId: string,
  ): Promise<{ blocked: true }> {
    return this.friends.block(me, userId);
  }

  /** DELETE /me/blocks/:userId — unblock them. */
  @Delete(':userId')
  unblock(
    @CurrentUserId() me: string,
    @Param('userId') userId: string,
  ): Promise<{ blocked: false }> {
    return this.friends.unblock(me, userId);
  }
}
