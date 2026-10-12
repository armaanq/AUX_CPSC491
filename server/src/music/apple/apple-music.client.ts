import { Injectable, Logger } from '@nestjs/common';
import { createPrivateKey, sign, type KeyObject } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { AmAlbum, AmDataResponse, AmSearchResponse, AmSong } from './apple-music.types.js';

/** Apple Music isn't set up on this server, or couldn't answer: outage, timeout, rejected key. */
export class AppleMusicUnavailableError extends Error {}

/** Apple Music said the song or album doesn't exist (HTTP 404). */
export class AppleMusicNotFoundError extends Error {}

const BASE_URL = 'https://api.music.apple.com/v1';
const TIMEOUT_MS = 8_000;
// Apple allows tokens to last up to 6 months; a short one limits the damage if one leaks.
const TOKEN_TTL_S = 12 * 60 * 60;
const RENEW_BEFORE_S = 60 * 60;
/** The most results Apple returns per type (songs, albums) in one search. */
export const APPLE_SEARCH_LIMIT = 25;

export interface AppleMusicConfig {
  teamId: string;
  keyId: string;
  key: KeyObject;
  /** Which country's catalog to search, e.g. "us". */
  storefront: string;
}

/**
 * Reads APPLE_MUSIC_TEAM_ID, APPLE_MUSIC_KEY_ID and APPLE_MUSIC_KEY_PATH (the
 * MusicKit .p8 file, kept outside the repo). Without them the server still runs
 * and search uses MusicBrainz, so teammates don't all need the key.
 */
export function appleMusicConfig(env: NodeJS.ProcessEnv = process.env): {
  config: AppleMusicConfig | null;
  problem?: string;
} {
  const { APPLE_MUSIC_TEAM_ID: teamId, APPLE_MUSIC_KEY_ID: keyId, APPLE_MUSIC_KEY_PATH: keyPath } = env;
  if (!teamId || !keyId || !keyPath) {
    return { config: null, problem: 'APPLE_MUSIC_TEAM_ID, APPLE_MUSIC_KEY_ID and APPLE_MUSIC_KEY_PATH are not all set' };
  }
  try {
    const key = createPrivateKey(readFileSync(keyPath));
    return { config: { teamId, keyId, key, storefront: env.APPLE_MUSIC_STOREFRONT || 'us' } };
  } catch (err) {
    return { config: null, problem: `the key at APPLE_MUSIC_KEY_PATH couldn't be read (${(err as Error).message})` };
  }
}

/** The "developer token" Apple Music requires: a JWT signed with the MusicKit key (ES256). */
export function signDeveloperToken(config: AppleMusicConfig, nowS: number, ttlS = TOKEN_TTL_S): string {
  const part = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const unsigned = `${part({ alg: 'ES256', kid: config.keyId })}.${part({ iss: config.teamId, iat: nowS, exp: nowS + ttlS })}`;
  // JWTs need the raw r||s signature, not Node's default DER encoding.
  const signature = sign('sha256', Buffer.from(unsigned), { key: config.key, dsaEncoding: 'ieee-p1363' });
  return `${unsigned}.${signature.toString('base64url')}`;
}

@Injectable()
export class AppleMusicClient {
  private readonly log = new Logger(AppleMusicClient.name);
  private readonly config: AppleMusicConfig | null;
  private token: { value: string; renewAt: number } | null = null;

  constructor() {
    const { config, problem } = appleMusicConfig();
    this.config = config;
    if (!config) this.log.warn(`Apple Music is off: ${problem}. Search will use MusicBrainz.`);
  }

  get enabled(): boolean {
    return this.config !== null;
  }

  /** Songs and albums matching the text, in Apple's order (relevance, then popularity). */
  async search(text: string): Promise<{ songs: AmSong[]; albums: AmAlbum[] }> {
    const params = new URLSearchParams({ term: text, types: 'songs,albums', limit: String(APPLE_SEARCH_LIMIT) });
    const body = await this.get<AmSearchResponse>(`/search?${params}`);
    return { songs: body.results?.songs?.data ?? [], albums: body.results?.albums?.data ?? [] };
  }

  async song(id: string): Promise<AmSong> {
    return this.only(await this.get<AmDataResponse<AmSong>>(`/songs/${encodeURIComponent(id)}`), id);
  }

  /** One album, including its tracklist. */
  async album(id: string): Promise<AmAlbum> {
    return this.only(await this.get<AmDataResponse<AmAlbum>>(`/albums/${encodeURIComponent(id)}`), id);
  }

  private only<T>(body: AmDataResponse<T>, id: string): T {
    const first = body.data?.[0];
    if (!first) throw new AppleMusicNotFoundError(`Not found: ${id}`);
    return first;
  }

  private async get<T>(path: string): Promise<T> {
    if (!this.config) throw new AppleMusicUnavailableError('Apple Music is not set up on this server');
    let res: Response;
    try {
      res = await fetch(`${BASE_URL}/catalog/${this.config.storefront}${path}`, {
        headers: { Authorization: `Bearer ${this.developerToken()}` },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      throw new AppleMusicUnavailableError(`Apple Music request failed: ${(err as Error).message}`);
    }
    if (res.status === 404) throw new AppleMusicNotFoundError(`Not found: ${path}`);
    if (res.status === 401 || res.status === 403) {
      this.token = null;
      this.log.error(`Apple Music rejected the developer token (${res.status}). Check APPLE_MUSIC_TEAM_ID and APPLE_MUSIC_KEY_ID.`);
    }
    if (!res.ok) throw new AppleMusicUnavailableError(`Apple Music responded ${res.status}`);
    try {
      return (await res.json()) as T;
    } catch {
      throw new AppleMusicUnavailableError('Apple Music sent a response that is not JSON');
    }
  }

  private developerToken(): string {
    const nowS = Math.floor(Date.now() / 1000);
    if (!this.token || nowS >= this.token.renewAt) {
      this.token = { value: signDeveloperToken(this.config!, nowS), renewAt: nowS + TOKEN_TTL_S - RENEW_BEFORE_S };
    }
    return this.token.value;
  }
}
