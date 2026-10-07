import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC = 'isPublic';

/** Lets a route or controller skip the login check that every other route requires. */
export const Public = () => SetMetadata(IS_PUBLIC, true);
