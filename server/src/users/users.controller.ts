import { Body, Controller, Delete, Get, HttpCode, Patch, Post } from '@nestjs/common';
import { CurrentUserId } from '../auth/current-user.decorator.js';
import {
  UsersService,
  type ProfileBody,
  type SelfUser,
} from './users.service.js';

@Controller('me')
export class MeController {
  constructor(private readonly users: UsersService) {}

  /** GET /me — the logged-in user's account. */
  @Get()
  me(@CurrentUserId() userId: string): Promise<SelfUser> {
    return this.users.findSelf(userId);
  }

  /** PATCH /me { bio } — edit your profile. */
  @Patch()
  update(
    @CurrentUserId() userId: string,
    @Body() body: ProfileBody | undefined,
  ): Promise<SelfUser> {
    return this.users.updateProfile(userId, body ?? {});
  }

  @Delete()
  deleteAccount(@CurrentUserId() userId: string, @Body() body: { password?: unknown } | undefined) {
    return this.users.deleteAccount(userId, body?.password);
  }

  /** POST /me/onboarded — first-run setup (importing a playlist) is done. */
  @Post('onboarded')
  @HttpCode(200)
  onboarded(@CurrentUserId() userId: string): Promise<SelfUser> {
    return this.users.completeOnboarding(userId);
  }
}
