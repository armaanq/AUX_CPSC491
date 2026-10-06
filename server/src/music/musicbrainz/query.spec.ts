import { buildRecordingQuery, normalizeQuery, tokenize } from './query.js';

describe('normalizeQuery', () => {
  it('makes equivalent queries share one cache key', () => {
    expect(normalizeQuery('Kendrick  Lamar ')).toBe('kendrick lamar');
    expect(normalizeQuery('KÉNDRICK LAMAR!')).toBe('kendrick lamar');
    expect(normalizeQuery('  kendrick\tlamar')).toBe('kendrick lamar');
  });

  it('keeps apostrophes inside words, normalizing curly ones', () => {
    expect(normalizeQuery('Don’t Stop')).toBe("don't stop");
    expect(normalizeQuery("'quoted'")).toBe('quoted');
  });

  it('keeps non-Latin scripts', () => {
    expect(normalizeQuery('宇多田ヒカル')).toBe('宇多田ヒカル');
  });
});

describe('tokenize', () => {
  it('strips every Lucene special character', () => {
    expect(tokenize('a+b -c && d || !e (f) {g} [h] ^i "j" ~k *l ?m :n \\o /p')).toEqual([
      'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h',
    ]);
  });

  it('caps very long input at 8 words', () => {
    expect(tokenize('one two three four five six seven eight nine ten')).toHaveLength(8);
  });
});

describe('buildRecordingQuery', () => {
  it('returns null when nothing searchable is left', () => {
    expect(buildRecordingQuery('  ?!*  ')).toBeNull();
  });

  it('requires each word in the title or the artist, boosting artist matches', () => {
    expect(buildRecordingQuery('Ivy Frank Ocean')).toBe(
      '(recording:"ivy" OR artist:"ivy"^2) AND (recording:"frank" OR artist:"frank"^2) AND ' +
        '(recording:"ocean" OR artist:"ocean"^2 OR recording:ocean* OR artist:ocean*)',
    );
  });

  it('has no whole-phrase title boost (a cover titled "Ivy (Frank Ocean Cover)" would win)', () => {
    expect(buildRecordingQuery('ivy frank ocean')).not.toMatch(/"ivy frank ocean"/);
  });

  it('prefix-matches the last word only when it has 3+ characters', () => {
    expect(buildRecordingQuery('sza ki')).not.toContain('ki*');
    expect(buildRecordingQuery('kendr')).toContain('recording:kendr*');
  });

  it('cannot be broken out of with quotes or operators', () => {
    const q = buildRecordingQuery('" OR artist:* AND (')!;
    // Operators become plain quoted words; only the last word gets a prefix match.
    expect(q).toBe(
      '(recording:"or" OR artist:"or"^2) AND (recording:"artist" OR artist:"artist"^2) AND ' +
        '(recording:"and" OR artist:"and"^2 OR recording:and* OR artist:and*)',
    );
  });
});
