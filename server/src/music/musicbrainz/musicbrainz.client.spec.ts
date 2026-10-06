import {
  MusicBrainzClient,
  MusicBrainzNotFoundError,
  MusicBrainzUnavailableError,
} from './musicbrainz.client.js';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('MusicBrainzClient', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('MUSICBRAINZ_USER_AGENT', 'AUX-test/1.0 ( test@example.com )');
    vi.stubEnv('MUSICBRAINZ_BASE_URL', 'https://mb.test/ws/2/');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('sends the User-Agent and a Lucene recording query as JSON', async () => {
    fetchMock.mockResolvedValueOnce(json({ count: 1, offset: 0, recordings: [{ id: 'r', title: 'Ivy' }] }));
    const recs = await new MusicBrainzClient().searchRecordings('ivy frank');
    expect(recs).toEqual([{ id: 'r', title: 'Ivy' }]);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const u = new URL(url);
    expect(u.origin + u.pathname).toBe('https://mb.test/ws/2/recording');
    expect(u.searchParams.get('fmt')).toBe('json');
    expect(u.searchParams.get('limit')).toBe('25');
    expect(u.searchParams.get('query')).toContain('artist:"frank"');
    expect((init.headers as Record<string, string>)['User-Agent']).toBe('AUX-test/1.0 ( test@example.com )');
  });

  it('does not call MusicBrainz for an empty query', async () => {
    await expect(new MusicBrainzClient().searchRecordings(' ?! ')).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('asks for artists, releases, release groups and ISRCs on lookup', async () => {
    fetchMock.mockResolvedValueOnce(json({ id: 'r', title: 'Ivy' }));
    await new MusicBrainzClient().lookupRecording('abc');
    const u = new URL(fetchMock.mock.calls[0][0] as string);
    expect(u.pathname).toBe('/ws/2/recording/abc');
    expect(u.searchParams.get('inc')).toBe('artist-credits+releases+release-groups+isrcs');
  });

  it('retries once on 503 (rate limited), waiting for the next slot', async () => {
    fetchMock
      .mockResolvedValueOnce(json({ error: 'slow down' }, 503))
      .mockResolvedValueOnce(json({ count: 0, offset: 0, recordings: [] }));
    const done = new MusicBrainzClient().searchRecordings('ivy');
    await vi.advanceTimersByTimeAsync(1_100);
    await expect(done).resolves.toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('gives up after a second 503', async () => {
    fetchMock.mockResolvedValue(json({}, 503));
    const done = new MusicBrainzClient().searchRecordings('ivy');
    const assertion = expect(done).rejects.toBeInstanceOf(MusicBrainzUnavailableError);
    await vi.advanceTimersByTimeAsync(1_100);
    await assertion;
  });

  it('maps 404 to NotFound and network errors to Unavailable', async () => {
    const client = new MusicBrainzClient();
    fetchMock.mockResolvedValueOnce(json({ error: 'Not Found' }, 404));
    await expect(client.lookupRecording('x')).rejects.toBeInstanceOf(MusicBrainzNotFoundError);

    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));
    const failing = client.lookupRecording('y');
    const assertion = expect(failing).rejects.toBeInstanceOf(MusicBrainzUnavailableError);
    await vi.advanceTimersByTimeAsync(1_100);
    await assertion;
  });

  it('never sends two requests less than a second apart', async () => {
    const times: number[] = [];
    fetchMock.mockImplementation(async () => {
      times.push(Date.now());
      return json({ count: 0, offset: 0, recordings: [] });
    });
    const client = new MusicBrainzClient();
    const all = Promise.all([client.searchRecordings('a1'), client.searchRecordings('b2'), client.searchRecordings('c3')]);
    await vi.advanceTimersByTimeAsync(5_000);
    await all;
    expect(times).toHaveLength(3);
    expect(times[1] - times[0]).toBeGreaterThanOrEqual(1_000);
    expect(times[2] - times[1]).toBeGreaterThanOrEqual(1_000);
  });

  it('fails fast instead of queueing a long line of requests', async () => {
    fetchMock.mockImplementation(async () => json({ count: 0, offset: 0, recordings: [] }));
    const client = new MusicBrainzClient();
    const calls = ['q1', 'q2', 'q3', 'q4'].map(q => client.searchRecordings(q).then(() => 'ok', e => e));
    await vi.advanceTimersByTimeAsync(5_000);
    const outcomes = await Promise.all(calls);
    expect(outcomes.slice(0, 3)).toEqual(['ok', 'ok', 'ok']);
    expect(outcomes[3]).toBeInstanceOf(MusicBrainzUnavailableError);
  });
});
