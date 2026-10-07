import { Controller, Get } from '@nestjs/common';
import { CurrentUserId } from '../auth/current-user.decorator.js';
import { UsersService, type SelfUser } from './users.service.js';

@Controller('me')
export class MeController {
  constructor(private readonly users: UsersService) {}

  /** GET /me — the logged-in user's account. */
  @Get()
  me(@CurrentUserId() userId: string): Promise<SelfUser> {
    return this.users.findSelf(userId);
  }
}
