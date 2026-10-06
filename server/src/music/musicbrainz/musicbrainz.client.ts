import { Injectable, Logger } from '@nestjs/common';
import { buildRecordingQuery } from './query.js';
import { RateLimiter } from './rate-limiter.js';
import type { MbRecording, MbRecordingSearchResponse } from './musicbrainz.types.js';

/** MusicBrainz said the thing doesn't exist (HTTP 404). */
export class MusicBrainzNotFoundError extends Error {}

/** MusicBrainz couldn't answer: rate limit, timeout, outage, bad response. */
export class MusicBrainzUnavailableError extends Error {}

const DEFAULT_BASE_URL = 'https://musicbrainz.org/ws/2';
// MusicBrainz requires a User-Agent naming the app and a way to contact you,
// and blocks generic ones. Set MUSICBRAINZ_USER_AGENT in .env to your own.
const DEFAULT_USER_AGENT = 'AUX-CPSC491/0.1.0 ( https://github.com/armaanq/AUX_CPSC491 )';
const TIMEOUT_MS = 8_000;

@Injectable()
export class MusicBrainzClient {
  private readonly log = new Logger(MusicBrainzClient.name);
  private readonly baseUrl = (process.env.MUSICBRAINZ_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, '');
  private readonly userAgent = process.env.MUSICBRAINZ_USER_AGENT || DEFAULT_USER_AGENT;
  // 1.1s instead of 1.0s leaves headroom for clock jitter. At most 3 calls
  // wait in line (~3s); anything beyond that fails fast and falls back.
  private readonly limiter = new RateLimiter(1_100, 3);

  constructor() {
    if (!process.env.MUSICBRAINZ_USER_AGENT) {
      this.log.warn(
        `MUSICBRAINZ_USER_AGENT is not set; using "${DEFAULT_USER_AGENT}". ` +
          'Set it to "AppName/version ( your-email )" in server/.env.',
      );
    }
  }

  /**
   * Song search. Returns recordings in MusicBrainz relevance order. Asks for
   * 100 (the API maximum) because one song appears once per release, so ~100
   * recordings collapse to a few dozen distinct songs. Still one request.
   */
  async searchRecordings(text: string, limit = 100): Promise<MbRecording[]> {
    const query = buildRecordingQuery(text);
    if (!query) return [];
    const params = new URLSearchParams({ query, limit: String(limit), fmt: 'json' });
    const body = await this.get<MbRecordingSearchResponse>(`/recording?${params}`);
    return body.recordings ?? [];
  }

  /** One recording with its artists, releases (+ release groups) and ISRCs. */
  lookupRecording(mbid: string): Promise<MbRecording> {
    const params = new URLSearchParams({
      inc: 'artist-credits+releases+release-groups+isrcs',
      fmt: 'json',
    });
    return this.get<MbRecording>(`/recording/${encodeURIComponent(mbid)}?${params}`);
  }

  private async get<T>(path: string, attempt = 1): Promise<T> {
    const res = await this.limiter
      .schedule(() =>
        fetch(`${this.baseUrl}${path}`, {
          headers: { 'User-Agent': this.userAgent, Accept: 'application/json' },
          signal: AbortSignal.timeout(TIMEOUT_MS),
        }),
      )
      .catch((err: Error) => {
        throw new MusicBrainzUnavailableError(`MusicBrainz request failed: ${err.message}`);
      });

    if (res.status === 404) throw new MusicBrainzNotFoundError(`Not found: ${path}`);
    // 503 is how MusicBrainz says "slow down". One retry, still rate limited.
    if (res.status === 503 && attempt === 1) {
      this.log.warn('MusicBrainz returned 503 (rate limited); retrying once');
      return this.get<T>(path, 2);
    }
    if (!res.ok) {
      throw new MusicBrainzUnavailableError(`MusicBrainz responded ${res.status}`);
    }
    try {
      return (await res.json()) as T;
    } catch {
      throw new MusicBrainzUnavailableError('MusicBrainz sent a response that is not JSON');
    }
  }
}
