import {
  bandOf,
  findMusic,
  initialRankings,
  insertRanking,
  rescore,
  scoreFor,
  SENTIMENT_BANDS,
  SENTIMENT_ORDER,
  tasteMatch,
  type Ranking,
} from '../src/data/prototype';

const inOrder = (list: Ranking[]) =>
  list.every(
    (r, i) =>
      !i ||
      SENTIMENT_ORDER.indexOf(list[i - 1].sentiment) <
        SENTIMENT_ORDER.indexOf(r.sentiment) ||
      list[i - 1].score > r.score,
  );

test('sample rankings are songs only, grouped by reaction and in score order', () => {
  expect(initialRankings.every(r => findMusic(r.musicId).kind === 'song')).toBe(
    true,
  );
  expect(inOrder(initialRankings)).toBe(true);
});

test('every insertion position lands the song there and keeps scores inside its band', () => {
  const loved = bandOf(initialRankings, 'LOVED', 't1');
  for (let index = 0; index <= loved.length; index++) {
    const result = insertRanking(initialRankings, 't1', 'LOVED', index);
    expect(bandOf(result, 'LOVED')[index].musicId).toBe('t1');
    expect(new Set(result.map(r => r.musicId)).size).toBe(result.length);
    expect(inOrder(result)).toBe(true);
    result.forEach(r => {
      const { min, max } = SENTIMENT_BANDS[r.sentiment];
      expect(r.score).toBeGreaterThanOrEqual(min);
      expect(r.score).toBeLessThanOrEqual(max);
      expect(Math.round(r.score * 100) / 100).toBe(r.score);
    });
  }
});

test('adding a song shifts the other scores in its band but not other bands', () => {
  const result = insertRanking(initialRankings, 't1', 'LOVED', 0);
  const before = (id: string) =>
    initialRankings.find(r => r.musicId === id)!.score;
  const after = (id: string) => result.find(r => r.musicId === id)!.score;
  bandOf(initialRankings, 'LOVED')
    .slice(1)
    .forEach(r => expect(after(r.musicId)).toBeLessThan(before(r.musicId)));
  bandOf(initialRankings, 'FINE').forEach(r =>
    expect(after(r.musicId)).toBe(before(r.musicId)),
  );
  expect(after('t1')).toBe(10);
});

test('reranking moves an entry, even across bands, without duplicating it', () => {
  const top = initialRankings[0].musicId;
  const result = insertRanking(initialRankings, top, 'DISLIKED', 0);
  expect(result).toHaveLength(initialRankings.length);
  expect(result[result.length - 1]).toEqual({
    musicId: top,
    sentiment: 'DISLIKED',
    score: SENTIMENT_BANDS.DISLIKED.max,
  });
});

test('albums cannot be ranked', () => {
  expect(insertRanking(initialRankings, 'a0', 'LOVED', 0)).toBe(
    initialRankings,
  );
});

test('the first song in a band starts at the top of that band', () => {
  expect(scoreFor('FINE', 0, 1)).toBe(6.66);
  expect(rescore([{ musicId: 't1', sentiment: 'LOVED', score: 0 }])).toEqual([
    { musicId: 't1', sentiment: 'LOVED', score: 10 },
  ]);
});

test('compatibility requires three shared ratings and is symmetric', () => {
  expect(
    tasteMatch(initialRankings, initialRankings.slice(0, 2)).score,
  ).toBeNull();
  expect(tasteMatch(initialRankings, initialRankings).score).toBe(100);
  const other = initialRankings.slice(0, 3).map(r => ({ ...r, score: 1 }));
  expect(tasteMatch(initialRankings, other)).toEqual(
    tasteMatch(other, initialRankings),
  );
});
