import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { AuthedRequest } from './auth.guard.js';

/** The logged-in user's id, set by AuthGuard. */
export const CurrentUserId = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): string =>
    ctx.switchToHttp().getRequest<AuthedRequest>().userId,
);
