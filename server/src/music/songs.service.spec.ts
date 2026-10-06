import { NotFoundException, NotImplementedException, ServiceUnavailableException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service.js';
import {
  MusicBrainzNotFoundError,
  MusicBrainzUnavailableError,
  type MusicBrainzClient,
} from './musicbrainz/musicbrainz.client.js';
import { SongsService } from './songs.service.js';
import { collab, IVY_ALBUM_RG, ivyOnBlonde, ivyRemaster } from '../../test/fixtures/musicbrainz.js';

function setup() {
  const mb = {
    searchRecordings: vi.fn().mockResolvedValue([ivyOnBlonde, ivyRemaster, collab]),
    lookupRecording: vi.fn().mockResolvedValue(ivyOnBlonde),
  };
  const prisma = {
    song: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockResolvedValue({ id: 'song-1' }),
    },
    album: {
      upsert: vi.fn().mockResolvedValue({ id: 'album-1' }),
    },
  };
  const service = new SongsService(
    prisma as unknown as PrismaService,
    mb as unknown as MusicBrainzClient,
  );
  return { service, mb, prisma };
}

describe('SongsService.search', () => {
  it('returns deduped MusicBrainz results', async () => {
    const { service } = setup();
    const { results, usedFallback } = await service.search('ivy');
    expect(usedFallback).toBe(false);
    expect(results.map(r => r.title)).toEqual(['Ivy', 'Pink + White']);
  });

  it('ignores queries shorter than 2 characters without calling MusicBrainz', async () => {
    const { service, mb } = setup();
    expect(await service.search('a')).toEqual({ results: [], usedFallback: false });
    expect(await service.search('  !? ')).toEqual({ results: [], usedFallback: false });
    expect(await service.search(undefined)).toEqual({ results: [], usedFallback: false });
    expect(mb.searchRecordings).not.toHaveBeenCalled();
  });

  it('serves repeat and differently-typed versions of a query from cache', async () => {
    const { service, mb } = setup();
    await service.search('Frank Ocean');
    await service.search('  frank   OCEAN ');
    await service.search('Frank Océan!');
    expect(mb.searchRecordings).toHaveBeenCalledTimes(1);
    expect(mb.searchRecordings).toHaveBeenCalledWith('frank ocean');
  });

  it('shares one MusicBrainz request between identical searches in flight', async () => {
    const { service, mb } = setup();
    await Promise.all([service.search('ivy'), service.search('IVY'), service.search('ivy ')]);
    expect(mb.searchRecordings).toHaveBeenCalledTimes(1);
  });

  it('links results that are already AUX songs, without changing the cache', async () => {
    const { service, prisma } = setup();
    prisma.song.findMany.mockResolvedValueOnce([{ id: 'aux-ivy', externalId: ivyOnBlonde.id }]);
    const first = await service.search('ivy');
    expect(first.results[0].songId).toBe('aux-ivy');
    expect(first.results[1].songId).toBeNull();
    // Next search: database says nothing is linked; cached result must not keep the old id.
    const second = await service.search('ivy');
    expect(second.results[0].songId).toBeNull();
  });

  it('still returns results if the database lookup fails', async () => {
    const { service, prisma } = setup();
    prisma.song.findMany.mockRejectedValueOnce(new Error('db down'));
    const { results } = await service.search('ivy');
    expect(results).toHaveLength(2);
    expect(results[0].songId).toBeNull();
  });

  it('falls back to songs in the AUX database when MusicBrainz is unavailable', async () => {
    const { service, mb, prisma } = setup();
    mb.searchRecordings.mockRejectedValueOnce(new MusicBrainzUnavailableError('503'));
    prisma.song.findMany.mockResolvedValueOnce([
      {
        id: 'aux-ivy',
        source: 'musicbrainz',
        externalId: ivyOnBlonde.id,
        title: 'Ivy',
        artist: 'Frank Ocean',
        album: { title: 'Blonde' },
        releaseYear: 2016,
        durationMs: 249191,
        isrc: 'USUM71607007',
        artworkUrl: null,
        externalUrl: 'https://musicbrainz.org/recording/x',
      },
    ]);
    const { results, usedFallback } = await service.search('ivy frank');
    expect(usedFallback).toBe(true);
    expect(results).toEqual([
      expect.objectContaining({ songId: 'aux-ivy', album: 'Blonde', title: 'Ivy' }),
    ]);
    // Every word must match the title or the artist.
    const where = prisma.song.findMany.mock.calls[0][0].where;
    expect(where.AND).toHaveLength(2);
  });

  it('does not cache a failed search, so the next try goes back to MusicBrainz', async () => {
    const { service, mb } = setup();
    mb.searchRecordings.mockRejectedValueOnce(new MusicBrainzUnavailableError('timeout'));
    await service.search('ivy');
    await service.search('ivy');
    expect(mb.searchRecordings).toHaveBeenCalledTimes(2);
  });

  it('returns 503 when both MusicBrainz and the database are down', async () => {
    const { service, mb, prisma } = setup();
    mb.searchRecordings.mockRejectedValueOnce(new MusicBrainzUnavailableError('down'));
    prisma.song.findMany.mockRejectedValueOnce(new Error('db down'));
    await expect(service.search('ivy')).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});

describe('SongsService.resolve', () => {
  it('returns the existing song without calling MusicBrainz', async () => {
    const { service, mb, prisma } = setup();
    prisma.song.findUnique.mockResolvedValueOnce({ id: 'existing' });
    await expect(service.resolve('musicbrainz', ivyOnBlonde.id)).resolves.toEqual({ id: 'existing' });
    expect(mb.lookupRecording).not.toHaveBeenCalled();
  });

  it('creates the album and song from a search result without a second MusicBrainz call', async () => {
    const { service, mb, prisma } = setup();
    await service.search('ivy');
    await expect(service.resolve('musicbrainz', ivyOnBlonde.id.toUpperCase())).resolves.toEqual({ id: 'song-1' });
    expect(mb.lookupRecording).not.toHaveBeenCalled();
    expect(prisma.album.upsert.mock.calls[0][0].create).toMatchObject({
      source: 'musicbrainz',
      externalId: IVY_ALBUM_RG,
      title: 'Blonde',
      artist: 'Frank Ocean',
    });
    expect(prisma.song.upsert.mock.calls[0][0].create).toMatchObject({
      source: 'musicbrainz',
      externalId: ivyOnBlonde.id,
      title: 'Ivy',
      albumId: 'album-1',
      isrc: 'USUM71607007',
    });
  });

  it('looks the recording up when it was never searched', async () => {
    const { service, mb } = setup();
    await service.resolve('musicbrainz', ivyOnBlonde.id);
    expect(mb.lookupRecording).toHaveBeenCalledWith(ivyOnBlonde.id);
  });

  it('creates a song with no album when the recording has no releases', async () => {
    const { service, mb, prisma } = setup();
    mb.lookupRecording.mockResolvedValueOnce(collab);
    await service.resolve('musicbrainz', collab.id);
    expect(prisma.album.upsert).not.toHaveBeenCalled();
    expect(prisma.song.upsert.mock.calls[0][0].create.albumId).toBeNull();
  });

  it('rejects bad input', async () => {
    const { service } = setup();
    await expect(service.resolve('spotify', 'abc')).rejects.toBeInstanceOf(NotImplementedException);
    await expect(service.resolve('deezer', ivyOnBlonde.id)).rejects.toThrow(/source must be/);
    await expect(service.resolve('musicbrainz', 'not-a-uuid')).rejects.toThrow(/UUID/);
    await expect(service.resolve('musicbrainz', 42)).rejects.toThrow(/UUID/);
  });

  it('maps MusicBrainz errors to 404 / 503', async () => {
    const { service, mb } = setup();
    mb.lookupRecording.mockRejectedValueOnce(new MusicBrainzNotFoundError('gone'));
    await expect(service.resolve('musicbrainz', ivyOnBlonde.id)).rejects.toBeInstanceOf(NotFoundException);
    mb.lookupRecording.mockRejectedValueOnce(new MusicBrainzUnavailableError('busy'));
    await expect(service.resolve('musicbrainz', ivyOnBlonde.id)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
