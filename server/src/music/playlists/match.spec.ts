import type { SearchResult } from '../catalog.js';
import { pickMatch, searchTextFor, titleWords } from './match.js';

const song = (title: string, artist: string, externalId = title): SearchResult => ({
  source: 'apple',
  externalId,
  title,
  artist,
  album: null,
  releaseYear: null,
  durationMs: null,
  isrc: null,
  genre: null,
  artworkUrl: null,
  externalUrl: 'https://music.apple.com',
  songId: null,
});

describe('titleWords', () => {
  it('drops featured artists, remaster tags and years but keeps "live"', () => {
    expect(titleWords('Ivy - 2016 Remaster')).toEqual(['ivy']);
    expect(titleWords('Money Trees (feat. Jay Rock)')).toEqual(['money', 'trees']);
    expect(titleWords('Money Trees feat. Jay Rock')).toEqual(['money', 'trees']);
    expect(titleWords('Nights (Live)')).toEqual(['nights', 'live']);
  });
});

describe('pickMatch', () => {
  it('matches the same song across catalogs despite credit formatting', () => {
    const wanted = { title: 'Money Trees', artist: 'Kendrick Lamar, Jay Rock' };
    const results = [
      song('Money Trees Deuce', 'Jay Rock'),
      song('Money Trees (feat. Jay Rock)', 'Kendrick Lamar', 'right'),
    ];
    expect(pickMatch(wanted, results)?.externalId).toBe('right');
  });

  it('refuses a different artist or a different recording', () => {
    expect(pickMatch({ title: 'Ivy', artist: 'Frank Ocean' }, [song('Ivy', 'Taylor Swift')])).toBeNull();
    expect(pickMatch({ title: 'Nights', artist: 'Frank Ocean' }, [song('Nights (Live)', 'Frank Ocean')])).toBeNull();
  });

  it('builds a search from the clean title and first artist', () => {
    expect(searchTextFor({ title: 'Money Trees (feat. Jay Rock)', artist: 'Kendrick Lamar, Jay Rock' })).toBe(
      'money trees Kendrick Lamar',
    );
  });
});
