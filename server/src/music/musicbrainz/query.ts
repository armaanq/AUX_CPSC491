/**
 * Cache key for a search: lowercase, accents removed, punctuation removed,
 * whitespace collapsed. "Kendrick  Lamar ", "kendrick lamar" and
 * "KÉNDRICK LAMAR!" all become "kendrick lamar".
 */
export function normalizeQuery(raw: string): string {
  return tokenize(raw).join(' ');
}

/** Words of a query, safe to drop into a Lucene query (no special characters). */
export function tokenize(raw: string): string[] {
  return raw
    .normalize('NFKD')
    .replace(/\p{M}/gu, '') // accents: é -> e
    .toLowerCase()
    .replace(/[\u2018\u2019\u02bc]/g, "'") // curly apostrophes -> '
    .replace(/[^\p{L}\p{N}']+/gu, ' ') // everything else that isn't a letter/digit
    .split(' ')
    .map(t => t.replace(/^'+|'+$/g, ''))
    .filter(Boolean)
    .slice(0, 8); // keeps very long pastes from building a huge query
}

const quote = (s: string) => `"${s.replace(/["\\]/g, '')}"`;

/**
 * Builds a Lucene query for the MusicBrainz recording index.
 *
 * Plain text only searches the song title, so "ivy frank ocean" would find
 * nothing. Instead every word must appear in the title OR the artist. Artist
 * matches are boosted, so "ivy frank ocean" ranks Frank Ocean's "Ivy" above a
 * cover titled "Ivy (Frank Ocean Cover)", which has every word in its title.
 * The last word also matches as a prefix ("kendr" finds "kendrick") so results
 * make sense while someone is typing.
 */
export function buildRecordingQuery(raw: string): string | null {
  const tokens = tokenize(raw);
  if (!tokens.length) return null;
  const last = tokens.length - 1;
  const perWord = tokens.map((t, i) => {
    const q = quote(t);
    const parts = [`recording:${q}`, `artist:${q}^2`];
    // Wildcards can't be quoted; apostrophes are fine unquoted in Lucene.
    if (i === last && t.length >= 3) parts.push(`recording:${t}*`, `artist:${t}*`);
    return `(${parts.join(' OR ')})`;
  });
  return perWord.join(' AND ');
}
