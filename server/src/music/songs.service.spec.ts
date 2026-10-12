import {
  BadRequestException,
  NotFoundException,
  NotImplementedException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import {
  AppleMusicNotFoundError,
  AppleMusicUnavailableError,
  type AppleMusicClient,
} from './apple/apple-music.client.js';
import {
  MusicBrainzNotFoundError,
  MusicBrainzUnavailableError,
  type MusicBrainzClient,
} from './musicbrainz/musicbrainz.client.js';
import { SongsService } from './songs.service.js';
import { collab, IVY_ALBUM_RG, ivyOnBlonde, ivyRemaster } from '../../test/fixtures/musicbrainz.js';
import {
  amBlonde,
  amBlondeWithTracks,
  amIvy,
  amIvyOnCompilation,
  amNights,
  BLONDE_ID,
} from '../../test/fixtures/apple-music.js';

/** `appleMusic: false` is a server without an Apple Music key, which searches MusicBrainz. */
function setup({ appleMusic = false } = {}) {
  const mb = {
    searchRecordings: vi.fn().mockResolvedValue([ivyOnBlonde, ivyRemaster, collab]),
    lookupRecording: vi.fn().mockResolvedValue(ivyOnBlonde),
  };
  const apple = {
    enabled: appleMusic,
    search: vi.fn().mockResolvedValue({ songs: [amIvy, amNights, amIvyOnCompilation], albums: [amBlonde] }),
    song: vi.fn().mockResolvedValue(amIvy),
    album: vi.fn().mockResolvedValue(amBlondeWithTracks),
  };
  const prisma = {
    song: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockResolvedValue({ id: 'song-1' }),
      update: vi.fn().mockResolvedValue({ id: 'song-1' }),
    },
    album: {
      upsert: vi.fn().mockResolvedValue({ id: 'album-1' }),
    },
  };
  const service = new SongsService(
    prisma as unknown as PrismaService,
    mb as unknown as MusicBrainzClient,
    apple as unknown as AppleMusicClient,
  );
  return { service, mb, apple, prisma };
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
    const empty = { results: [], albums: [], usedFallback: false };
    expect(await service.search('a')).toEqual(empty);
    expect(await service.search('  !? ')).toEqual(empty);
    expect(await service.search(undefined)).toEqual(empty);
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
    prisma.song.findMany.mockResolvedValueOnce([
      { id: 'aux-ivy', source: 'musicbrainz', externalId: ivyOnBlonde.id, isrc: null },
    ]);
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

  it('uses the Apple Music copy when it’s the same recording (same ISRC)', async () => {
    const { service, prisma } = setup();
    prisma.song.findMany.mockResolvedValueOnce([{ id: 'apple-ivy', source: 'apple' }]);
    await expect(service.resolve('musicbrainz', ivyOnBlonde.id)).resolves.toEqual({ id: 'apple-ivy' });
    expect(prisma.song.findMany.mock.calls[0][0].where).toEqual({ isrc: 'USUM71607007' });
    expect(prisma.song.upsert).not.toHaveBeenCalled();
  });
});

describe('SongsService.search with Apple Music', () => {
  it('searches Apple Music first: songs in its order, one copy per recording, plus albums', async () => {
    const { service, mb, apple } = setup({ appleMusic: true });
    const { results, albums, usedFallback } = await service.search('Frank Ocean');
    expect(apple.search).toHaveBeenCalledWith('frank ocean');
    expect(mb.searchRecordings).not.toHaveBeenCalled();
    expect(results.map(r => [r.source, r.title])).toEqual([
      ['apple', 'Ivy'],
      ['apple', 'Nights'],
    ]);
    expect(albums.map(a => a.title)).toEqual(['Blonde']);
    expect(usedFallback).toBe(false);
  });

  it('falls back to MusicBrainz when Apple Music is unavailable', async () => {
    const { service, mb, apple } = setup({ appleMusic: true });
    apple.search.mockRejectedValueOnce(new AppleMusicUnavailableError('timeout'));
    const { results, albums, usedFallback } = await service.search('ivy');
    expect(mb.searchRecordings).toHaveBeenCalledWith('ivy');
    expect(results.map(r => r.source)).toEqual(['musicbrainz', 'musicbrainz']);
    expect(albums).toEqual([]);
    expect(usedFallback).toBe(false);
  });

  it('uses MusicBrainz without trying Apple Music when this server has no key', async () => {
    const { service, apple, mb } = setup({ appleMusic: false });
    await service.search('ivy');
    expect(apple.search).not.toHaveBeenCalled();
    expect(mb.searchRecordings).toHaveBeenCalled();
  });

  it('caches Apple Music searches and shares identical ones in flight', async () => {
    const { service, apple } = setup({ appleMusic: true });
    await Promise.all([service.search('ivy'), service.search('IVY')]);
    await service.search('ivy!');
    expect(apple.search).toHaveBeenCalledTimes(1);
  });

  it('links a result to the same recording saved from another catalog (by ISRC)', async () => {
    const { service, prisma } = setup({ appleMusic: true });
    prisma.song.findMany.mockResolvedValueOnce([
      { id: 'aux-ivy', source: 'musicbrainz', externalId: 'some-mbid', isrc: 'QZ5C81600002' },
    ]);
    const { results } = await service.search('ivy');
    expect(results[0]).toMatchObject({ title: 'Ivy', songId: 'aux-ivy' });
    expect(results[1].songId).toBeNull();
  });
});

describe('SongsService.album', () => {
  it('returns an Apple Music album with its songs, skipping music videos', async () => {
    const { service } = setup({ appleMusic: true });
    const { album, tracks } = await service.album('apple', BLONDE_ID);
    expect(album).toMatchObject({ source: 'apple', title: 'Blonde', trackCount: 17 });
    expect(tracks.map(t => t.title)).toEqual(['Nikes', 'Ivy']);
  });

  it('caches albums', async () => {
    const { service, apple } = setup({ appleMusic: true });
    await service.album('apple', BLONDE_ID);
    await service.album('apple', BLONDE_ID);
    expect(apple.album).toHaveBeenCalledTimes(1);
  });

  it('rejects other catalogs and bad ids', async () => {
    const { service } = setup({ appleMusic: true });
    await expect(service.album('musicbrainz', BLONDE_ID)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.album('apple', 'blonde')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('maps Apple Music errors to 404 / 503', async () => {
    const { service, apple } = setup({ appleMusic: true });
    apple.album.mockRejectedValueOnce(new AppleMusicNotFoundError('gone'));
    await expect(service.album('apple', '1')).rejects.toBeInstanceOf(NotFoundException);
    apple.album.mockRejectedValueOnce(new AppleMusicUnavailableError('busy'));
    await expect(service.album('apple', '2')).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(setup({ appleMusic: false }).service.album('apple', '3')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});

describe('SongsService.resolve with Apple Music', () => {
  it('creates the song and its album from a search result without calling Apple again', async () => {
    const { service, apple, prisma } = setup({ appleMusic: true });
    await service.search('ivy');
    await expect(service.resolve('apple', amIvy.id)).resolves.toEqual({ id: 'song-1' });
    expect(apple.song).not.toHaveBeenCalled();
    expect(prisma.album.upsert.mock.calls[0][0].create).toMatchObject({
      source: 'apple',
      externalId: BLONDE_ID,
      title: 'Blonde',
      artist: 'Frank Ocean',
    });
    expect(prisma.song.upsert.mock.calls[0][0].create).toMatchObject({
      source: 'apple',
      externalId: amIvy.id,
      title: 'Ivy',
      albumId: 'album-1',
      isrc: 'QZ5C81600002',
      genre: 'Pop',
    });
  });

  it('returns the existing song without calling Apple', async () => {
    const { service, apple, prisma } = setup({ appleMusic: true });
    prisma.song.findUnique.mockResolvedValueOnce({ id: 'existing' });
    await expect(service.resolve('apple', amIvy.id)).resolves.toEqual({ id: 'existing' });
    expect(apple.song).not.toHaveBeenCalled();
  });

  it('looks the song up when it was never searched', async () => {
    const { service, apple } = setup({ appleMusic: true });
    await service.resolve('apple', amIvy.id);
    expect(apple.song).toHaveBeenCalledWith(amIvy.id);
  });

  it('switches a MusicBrainz copy of the same recording to Apple Music, keeping its id', async () => {
    const { service, prisma } = setup({ appleMusic: true });
    prisma.song.findMany.mockResolvedValueOnce([{ id: 'mb-ivy', source: 'musicbrainz' }]);
    prisma.song.update.mockResolvedValueOnce({ id: 'mb-ivy' });
    await expect(service.resolve('apple', amIvy.id)).resolves.toEqual({ id: 'mb-ivy' });
    expect(prisma.song.update.mock.calls[0][0]).toMatchObject({
      where: { id: 'mb-ivy' },
      data: { source: 'apple', externalId: amIvy.id, title: 'Ivy' },
    });
    expect(prisma.song.upsert).not.toHaveBeenCalled();
  });

  it('reuses Apple Music’s other copy of the same recording', async () => {
    const { service, prisma } = setup({ appleMusic: true });
    prisma.song.findMany.mockResolvedValueOnce([
      { id: 'mb-ivy', source: 'musicbrainz' },
      { id: 'album-ivy', source: 'apple' },
    ]);
    await expect(service.resolve('apple', amIvyOnCompilation.id)).resolves.toEqual({ id: 'album-ivy' });
    expect(prisma.song.update).not.toHaveBeenCalled();
    expect(prisma.song.upsert).not.toHaveBeenCalled();
  });

  it('uses the row another request saved at the same moment', async () => {
    const { service, prisma } = setup({ appleMusic: true });
    prisma.song.upsert.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: 'test' }),
    );
    prisma.song.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'theirs' });
    await expect(service.resolve('apple', amIvy.id)).resolves.toEqual({ id: 'theirs' });
  });

  it('rejects bad ids and maps Apple Music errors to 404 / 503', async () => {
    const { service, apple } = setup({ appleMusic: true });
    await expect(service.resolve('apple', 'not-digits')).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.resolve('apple', 42)).rejects.toBeInstanceOf(BadRequestException);
    apple.song.mockRejectedValueOnce(new AppleMusicNotFoundError('gone'));
    await expect(service.resolve('apple', '1')).rejects.toBeInstanceOf(NotFoundException);
    apple.song.mockRejectedValueOnce(new AppleMusicUnavailableError('busy'));
    await expect(service.resolve('apple', '2')).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(setup({ appleMusic: false }).service.resolve('apple', '3')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
