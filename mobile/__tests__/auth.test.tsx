import React from 'react';
import { Text, TextInput } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Keychain from 'react-native-keychain';
import App from '../App';
import { searchSongs } from '../src/api/songs';

// The real provider waits for device screen measurements, which Jest doesn't have.
jest.mock('react-native-safe-area-context', () =>
  require('react-native-safe-area-context/jest/mock').default,
);

const SERVICE = 'com.aux.session';
const fetchMock = jest.fn();
globalThis.fetch = fetchMock as unknown as typeof fetch;
const reply = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

const user = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'armaan@example.com',
  username: 'armaan',
  bio: '',
  avatarUrl: null,
  favoriteGenres: [],
  createdAt: '2026-10-06T00:00:00.000Z',
};

type Renderer = TestRenderer.ReactTestRenderer;

async function launch() {
  let r: Renderer;
  await act(async () => {
    r = TestRenderer.create(<App />);
  });
  await act(async () => {});
  return r!;
}
const texts = (r: Pick<Renderer, 'root'>) =>
  r.root
    .findAllByType(Text)
    .map(t => [t.props.children].flat().join(''))
    .join('\n');
async function type(r: Renderer, label: string, value: string) {
  // Earlier screens stay mounted under the current one, so use the last match.
  const input = r.root
    .findAll(n => n.type === TextInput && n.props.accessibilityLabel === label)
    .at(-1);
  if (!input) throw new Error(`No field "${label}"`);
  await act(async () => input.props.onChangeText(value));
}
async function press(r: Renderer, label: string) {
  const target = r.root
    .findAll(n => typeof n.props.onPress === 'function')
    .find(n => texts({ root: n } as Renderer).includes(label));
  if (!target) throw new Error(`No button "${label}"`);
  await act(async () => target.props.onPress());
  await act(async () => {});
}
const savedToken = async () => {
  const saved = await Keychain.getGenericPassword({ service: SERVICE });
  return saved ? saved.password : null;
};
const call = (i: number) => {
  const [url, init] = fetchMock.mock.calls[i] as [string, RequestInit];
  return {
    url,
    body: init?.body ? JSON.parse(String(init.body)) : undefined,
    auth: (init?.headers as Record<string, string>)?.Authorization,
  };
};

beforeEach(async () => {
  fetchMock.mockReset();
  await AsyncStorage.clear();
  await Keychain.resetGenericPassword({ service: SERVICE });
});

describe('logging in', () => {
  it('starts on the login screen when nobody is logged in', async () => {
    const r = await launch();
    expect(texts(r)).toContain('Log in to your');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('saves the session in the Keychain, opens the app, and signs later requests', async () => {
    fetchMock.mockReturnValueOnce(reply(200, { token: 'tok-1', user }));
    const r = await launch();
    await type(r, 'Email or username', ' Armaan ');
    await type(r, 'Password', 'longenough');
    await press(r, 'Log in');

    expect(call(0).url).toBe('http://localhost:3000/auth/login');
    expect(call(0).body).toEqual({ identifier: 'Armaan', password: 'longenough' });
    expect(await savedToken()).toBe('tok-1');
    expect(texts(r)).not.toContain('Log in to your');
    expect(texts(r)).toContain('Charts');

    fetchMock.mockReturnValueOnce(reply(200, { results: [], usedFallback: false }));
    await searchSongs('ivy');
    expect(call(1).auth).toBe('Bearer tok-1');
  });

  it("shows the server's message for a wrong password and stays logged out", async () => {
    fetchMock.mockReturnValueOnce(
      reply(401, { message: 'Incorrect email/username or password.' }),
    );
    const r = await launch();
    await type(r, 'Email or username', 'armaan');
    await type(r, 'Password', 'wrong-password');
    await press(r, 'Log in');

    expect(texts(r)).toContain('Incorrect email/username or password.');
    expect(texts(r)).toContain('Log in to your');
    expect(await savedToken()).toBeNull();
  });

  it('asks for both fields before contacting the server', async () => {
    const r = await launch();
    await press(r, 'Log in');
    expect(texts(r)).toContain('Enter your email or username and your password.');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('signing up', () => {
  it('creates the account and opens the app', async () => {
    const r = await launch();
    await press(r, 'Create an account');
    expect(texts(r)).toContain('Make your taste');

    await type(r, 'Email', 'armaan@example.com');
    await type(r, 'Username', 'armaan');
    await type(r, 'Password', 'short');
    await press(r, 'Create account');
    expect(texts(r)).toContain('Your password needs at least 8 characters.');
    expect(fetchMock).not.toHaveBeenCalled();

    fetchMock.mockReturnValueOnce(reply(201, { token: 'tok-new', user }));
    await type(r, 'Password', 'longenough');
    await press(r, 'Create account');
    expect(call(0).url).toBe('http://localhost:3000/auth/signup');
    expect(call(0).body).toEqual({
      email: 'armaan@example.com',
      username: 'armaan',
      password: 'longenough',
    });
    expect(await savedToken()).toBe('tok-new');
    expect(texts(r)).toContain('Charts');
  });

  it('shows why the server refused the signup', async () => {
    fetchMock.mockReturnValueOnce(reply(409, { message: 'That username is taken.' }));
    const r = await launch();
    await press(r, 'Create an account');
    await type(r, 'Email', 'armaan@example.com');
    await type(r, 'Username', 'armaan');
    await type(r, 'Password', 'longenough');
    await press(r, 'Create account');
    expect(texts(r)).toContain('That username is taken.');
    expect(await savedToken()).toBeNull();
  });
});

describe('reopening the app', () => {
  it('restores a saved session after checking it with the server', async () => {
    await Keychain.setGenericPassword('armaan', 'tok-saved', { service: SERVICE });
    fetchMock.mockReturnValueOnce(reply(200, user));
    const r = await launch();
    expect(call(0).url).toBe('http://localhost:3000/me');
    expect(call(0).auth).toBe('Bearer tok-saved');
    expect(texts(r)).toContain('Charts');
  });

  it('forgets an expired session and goes back to login', async () => {
    await Keychain.setGenericPassword('armaan', 'tok-old', { service: SERVICE });
    fetchMock.mockReturnValueOnce(reply(401, { message: 'Your session has expired.' }));
    const r = await launch();
    expect(texts(r)).toContain('Log in to your');
    expect(await savedToken()).toBeNull();
  });

  it('keeps the session when the server is unreachable, and Try again recovers', async () => {
    await Keychain.setGenericPassword('armaan', 'tok-saved', { service: SERVICE });
    fetchMock.mockRejectedValueOnce(new TypeError('Network request failed'));
    const r = await launch();
    expect(texts(r)).toContain('answering.');
    expect(texts(r)).toContain('npm run start:dev');
    expect(await savedToken()).toBe('tok-saved');

    fetchMock.mockReturnValueOnce(reply(200, user));
    await press(r, 'Try again');
    expect(texts(r)).toContain('Charts');
  });
});

it('logs out when the server rejects the session mid-use', async () => {
  await Keychain.setGenericPassword('armaan', 'tok-revoked', { service: SERVICE });
  fetchMock.mockReturnValueOnce(reply(200, user));
  const r = await launch();
  expect(texts(r)).toContain('Charts');

  fetchMock.mockReturnValueOnce(reply(401, { message: 'Your session has expired.' }));
  await act(async () => {
    await searchSongs('ivy').catch(() => {});
  });
  await act(async () => {});
  expect(texts(r)).toContain('Log in to your');
  expect(await savedToken()).toBeNull();
});
