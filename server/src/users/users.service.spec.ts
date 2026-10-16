import { BadRequestException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service.js';
import { UsersService } from './users.service.js';

const ME = '11111111-1111-4111-8111-111111111111';

function setup(onboardedAt: Date | null = null) {
  const prisma = {
    user: {
      findUnique: vi.fn().mockResolvedValue({ id: ME, bio: '', onboardedAt }),
      update: vi.fn(({ data }) => Promise.resolve({ id: ME, bio: '', onboardedAt, ...data })),
    },
  };
  return { service: new UsersService(prisma as unknown as PrismaService), prisma };
}

describe('UsersService.updateProfile', () => {
  it('saves a trimmed bio', async () => {
    const { service, prisma } = setup();
    const user = await service.updateProfile(ME, { bio: '  Late-night listening.  ' });
    expect(user.bio).toBe('Late-night listening.');
    expect(prisma.user.update.mock.calls[0][0].data).toEqual({ bio: 'Late-night listening.' });
  });

  it('rejects a missing or too-long bio', async () => {
    const { service, prisma } = setup();
    await expect(service.updateProfile(ME, {})).rejects.toThrow(BadRequestException);
    await expect(service.updateProfile(ME, { bio: 'x'.repeat(161) })).rejects.toThrow(
      BadRequestException,
    );
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});

describe('UsersService.completeOnboarding', () => {
  it('records when setup was finished', async () => {
    const { service } = setup();
    expect((await service.completeOnboarding(ME)).onboardedAt).toBeInstanceOf(Date);
  });

  it('keeps the first time when called again', async () => {
    const first = new Date('2026-10-16T00:00:00Z');
    const { service, prisma } = setup(first);
    expect((await service.completeOnboarding(ME)).onboardedAt).toBe(first);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});
