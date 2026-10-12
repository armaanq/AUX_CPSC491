import { createPublicKey, generateKeyPairSync, verify } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  AppleMusicClient,
  AppleMusicNotFoundError,
  AppleMusicUnavailableError,
  appleMusicConfig,
  signDeveloperToken,
} from './apple-music.client.js';
import { amBlonde, amIvy } from '../../../test/fixtures/apple-music.js';

// A throwaway key in the same format as a MusicKit .p8 file.
const dir = mkdtempSync(join(tmpdir(), 'aux-apple-'));
const keyPath = join(dir, 'AuthKey_TESTKEY123.p8');
const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
writeFileSync(keyPath, privateKey.export({ type: 'pkcs8', format: 'pem' }));
const ENV = { APPLE_MUSIC_TEAM_ID: 'TEAM123456', APPLE_MUSIC_KEY_ID: 'TESTKEY123', APPLE_MUSIC_KEY_PATH: keyPath };

const saved = { ...process.env };
const fetchMock = vi.fn();
beforeEach(() => {
  Object.assign(process.env, ENV);
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  process.env = { ...saved };
  vi.unstubAllGlobals();
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const reply = (status: number, body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status }));
const decode = (part: string) => JSON.parse(Buffer.from(part, 'base64url').toString());

describe('appleMusicConfig', () => {
  it('is off, with the reason, when the settings are missing', () => {
    const { config, problem } = appleMusicConfig({ APPLE_MUSIC_TEAM_ID: 'TEAM123456' });
    expect(config).toBeNull();
    expect(problem).toMatch(/not all set/);
  });

  it('is off when the key file can’t be read', () => {
    const { config, problem } = appleMusicConfig({ ...ENV, APPLE_MUSIC_KEY_PATH: join(dir, 'missing.p8') });
    expect(config).toBeNull();
    expect(problem).toMatch(/couldn't be read/);
  });

  it('loads the key and defaults to the US catalog', () => {
    const { config } = appleMusicConfig(ENV);
    expect(config).toMatchObject({ teamId: 'TEAM123456', keyId: 'TESTKEY123', storefront: 'us' });
  });
});

describe('signDeveloperToken', () => {
  it('makes an ES256 JWT that Apple can verify with the key', () => {
    const { config } = appleMusicConfig(ENV);
    const token = signDeveloperToken(config!, 1_000_000, 3600);
    const [header, payload, signature] = token.split('.');
    expect(decode(header)).toEqual({ alg: 'ES256', kid: 'TESTKEY123' });
    expect(decode(payload)).toEqual({ iss: 'TEAM123456', iat: 1_000_000, exp: 1_003_600 });
    const valid = verify(
      'sha256',
      Buffer.from(`${header}.${payload}`),
      { key: createPublicKey(privateKey), dsaEncoding: 'ieee-p1363' },
      Buffer.from(signature, 'base64url'),
    );
    expect(valid).toBe(true);
  });
});

describe('AppleMusicClient', () => {
  it('searches songs and albums in the US catalog with a signed token', async () => {
    fetchMock.mockReturnValueOnce(
      reply(200, { results: { songs: { data: [amIvy] }, albums: { data: [amBlonde] } } }),
    );
    const client = new AppleMusicClient();
    const { songs, albums } = await client.search('frank ocean');
    expect(songs).toEqual([amIvy]);
    expect(albums).toEqual([amBlonde]);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.music.apple.com/v1/catalog/us/search?term=frank+ocean&types=songs%2Calbums&limit=25');
    expect(init.headers.Authorization).toMatch(/^Bearer [\w-]+\.[\w-]+\.[\w-]+$/);
  });

  it('reuses one token for many requests', async () => {
    fetchMock.mockImplementation(() => reply(200, { results: {} }));
    const client = new AppleMusicClient();
    await client.search('ivy');
    await client.search('nights');
    const [first, second] = fetchMock.mock.calls.map(([, init]) => init.headers.Authorization);
    expect(second).toBe(first);
  });

  it('fetches the overall chart, or one genre’s, as songs and albums', async () => {
    fetchMock.mockImplementation(() =>
      reply(200, {
        results: {
          songs: [{ name: 'Top Songs', data: [amIvy] }],
          albums: [{ name: 'Top Albums', data: [amBlonde] }],
        },
      }),
    );
    const client = new AppleMusicClient();
    await expect(client.charts()).resolves.toEqual({ songs: [amIvy], albums: [amBlonde] });
    await client.charts('18');
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      'https://api.music.apple.com/v1/catalog/us/charts?types=songs%2Calbums&limit=25',
      'https://api.music.apple.com/v1/catalog/us/charts?types=songs%2Calbums&limit=25&genre=18',
    ]);
  });

  it('fetches one song or album by id', async () => {
    fetchMock.mockReturnValueOnce(reply(200, { data: [amBlonde] }));
    const client = new AppleMusicClient();
    await expect(client.album('1146195596')).resolves.toEqual(amBlonde);
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.music.apple.com/v1/catalog/us/albums/1146195596');
  });

  it('turns failures into not-found and unavailable errors', async () => {
    const client = new AppleMusicClient();
    fetchMock.mockReturnValueOnce(reply(404, { errors: [] }));
    await expect(client.song('1')).rejects.toBeInstanceOf(AppleMusicNotFoundError);
    fetchMock.mockReturnValueOnce(reply(200, { data: [] }));
    await expect(client.song('1')).rejects.toBeInstanceOf(AppleMusicNotFoundError);
    fetchMock.mockReturnValueOnce(reply(500, {}));
    await expect(client.search('ivy')).rejects.toBeInstanceOf(AppleMusicUnavailableError);
    fetchMock.mockReturnValueOnce(reply(401, {}));
    await expect(client.search('ivy')).rejects.toBeInstanceOf(AppleMusicUnavailableError);
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));
    await expect(client.search('ivy')).rejects.toBeInstanceOf(AppleMusicUnavailableError);
  });

  it('is off without a key, and fails fast without calling Apple', async () => {
    delete process.env.APPLE_MUSIC_KEY_PATH;
    const client = new AppleMusicClient();
    expect(client.enabled).toBe(false);
    await expect(client.search('ivy')).rejects.toBeInstanceOf(AppleMusicUnavailableError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
