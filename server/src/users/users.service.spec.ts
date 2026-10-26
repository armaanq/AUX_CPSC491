import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { hashPassword } from '../auth/password.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { UsersService } from './users.service.js';

const ME = '11111111-1111-4111-8111-111111111111';

function setup(onboardedAt: Date | null = null) {
  const prisma = {
    user: {
      findUnique: vi.fn().mockResolvedValue({ id: ME, bio: '', onboardedAt }),
      delete: vi.fn().mockResolvedValue({ id: ME }),
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


describe('profile photos and account deletion', () => {
  const photo = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
  it('saves and removes a photo without overwriting the bio', async () => {
    const { service, prisma } = setup();
    await service.updateProfile(ME, { avatarUrl: photo });
    expect(prisma.user.update.mock.calls[0][0].data).toEqual({ avatarUrl: photo });
    await service.updateProfile(ME, { avatarUrl: null });
    expect(prisma.user.update.mock.calls[1][0].data).toEqual({ avatarUrl: null });
  });
  it.each(['file:///tmp/photo.png', 'data:image/svg+xml;base64,AAAA', 'data:image/png;base64,YWJj', 'x'.repeat(350001)])('rejects invalid photos', async avatarUrl => {
    const { service, prisma } = setup();
    await expect(service.updateProfile(ME, { avatarUrl })).rejects.toThrow(BadRequestException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
  it('requires the current password before deleting only the signed-in account', async () => {
    const { service, prisma } = setup();
    prisma.user.findUnique.mockResolvedValue({ id: ME, bio: '', onboardedAt: null, passwordHash: await hashPassword('correct-password') } as never);
    await expect(service.deleteAccount(ME, 'wrong')).rejects.toThrow(ForbiddenException);
    expect(prisma.user.delete).not.toHaveBeenCalled();
    await expect(service.deleteAccount(ME, 'correct-password')).resolves.toEqual({ deleted: true });
    expect(prisma.user.delete).toHaveBeenCalledWith({ where: { id: ME } });
  });
});
