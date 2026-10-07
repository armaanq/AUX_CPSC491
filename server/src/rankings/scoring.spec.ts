import { place, remove, scoreFor, type Placement } from './scoring.js';

const ids = (list: Placement[]) => list.map((p) => p.songId);
const scores = (list: Placement[]) => list.map((p) => p.score);

function build(...steps: [string, Placement['sentiment'], number][]) {
  return steps.reduce<Placement[]>(
    (list, [id, s, at]) => place(list, id, s, at),
    [],
  );
}

describe('scoreFor (must match the mobile app)', () => {
  it('starts each band at its top score', () => {
    expect(scoreFor('LOVED', 0, 1)).toBe(10);
    expect(scoreFor('FINE', 0, 1)).toBe(6.66);
    expect(scoreFor('DISLIKED', 0, 1)).toBe(3.33);
  });

  it('spreads a band evenly, rounded to 2 decimals', () => {
    expect([0, 1, 2].map((i) => scoreFor('LOVED', i, 3))).toEqual([
      10, 8.89, 7.78,
    ]);
  });
});

describe('place', () => {
  it('puts the first song at the top of its band', () => {
    expect(place([], 'a', 'FINE', 5)).toEqual([
      { songId: 'a', sentiment: 'FINE', position: 0, score: 6.66 },
    ]);
  });

  it('lands the song at every possible spot and keeps scores inside the band', () => {
    const base = build(['a', 'LOVED', 0], ['b', 'LOVED', 1], ['c', 'LOVED', 2]);
    for (let at = 0; at <= 3; at++) {
      const next = place(base, 'new', 'LOVED', at);
      expect(next.find((p) => p.songId === 'new')!.position).toBe(at);
      expect(next.map((p) => p.position)).toEqual([0, 1, 2, 3]);
      for (const s of scores(next)) {
        expect(s).toBeGreaterThanOrEqual(6.67);
        expect(s).toBeLessThanOrEqual(10);
      }
    }
  });

  it('shifts the other songs in its band but leaves other bands alone', () => {
    const before = build(
      ['a', 'LOVED', 0],
      ['b', 'LOVED', 1],
      ['x', 'FINE', 0],
    );
    const after = place(before, 'new', 'LOVED', 0);
    expect(ids(after)).toEqual(['new', 'a', 'b', 'x']);
    expect(scores(after)).toEqual([10, 8.89, 7.78, 6.66]);
  });

  it('moves an already-ranked song, even across bands, without duplicating it', () => {
    const before = build(
      ['a', 'LOVED', 0],
      ['b', 'LOVED', 1],
      ['x', 'FINE', 0],
    );
    const after = place(before, 'a', 'FINE', 1);
    expect(ids(after)).toEqual(['b', 'x', 'a']);
    expect(after.filter((p) => p.songId === 'a')).toHaveLength(1);
    // The band it left closes the gap; the band it joined re-spreads.
    expect(after).toEqual([
      { songId: 'b', sentiment: 'LOVED', position: 0, score: 10 },
      { songId: 'x', sentiment: 'FINE', position: 0, score: 6.66 },
      { songId: 'a', sentiment: 'FINE', position: 1, score: 5 },
    ]);
  });

  it('treats a position past the end as last', () => {
    const before = build(['a', 'DISLIKED', 0]);
    expect(ids(place(before, 'b', 'DISLIKED', 99))).toEqual(['a', 'b']);
  });

  it('accepts its input in any order', () => {
    const ordered = build(
      ['a', 'LOVED', 0],
      ['b', 'FINE', 0],
      ['c', 'DISLIKED', 0],
    );
    const shuffled = [ordered[2], ordered[0], ordered[1]];
    expect(place(shuffled, 'd', 'FINE', 0)).toEqual(
      place(ordered, 'd', 'FINE', 0),
    );
  });
});

describe('remove', () => {
  it('closes the gap and re-spreads that band', () => {
    const before = build(
      ['a', 'LOVED', 0],
      ['b', 'LOVED', 1],
      ['c', 'LOVED', 2],
    );
    expect(remove(before, 'a')).toEqual([
      { songId: 'b', sentiment: 'LOVED', position: 0, score: 10 },
      { songId: 'c', sentiment: 'LOVED', position: 1, score: 8.34 },
    ]);
  });

  it('ignores a song that is not ranked', () => {
    const before = build(['a', 'LOVED', 0]);
    expect(remove(before, 'missing')).toEqual(before);
  });
});
