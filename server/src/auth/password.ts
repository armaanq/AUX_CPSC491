import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

// OWASP's recommended scrypt strength in its low-memory form (N=2^15, r=8,
// p=3 is equivalent to N=2^17, r=8, p=1 but needs 32 MiB instead of 128).
const PARAMS = { N: 2 ** 15, r: 8, p: 3 };
const KEY_LENGTH = 32;
const SALT_LENGTH = 16;
const MAX_MEMORY = 64 * 1024 * 1024;

type Params = typeof PARAMS;

function derive(
  password: string,
  salt: Buffer,
  params: Params,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      password.normalize('NFKC'),
      salt,
      KEY_LENGTH,
      { ...params, maxmem: MAX_MEMORY },
      (err, key) => (err ? reject(err) : resolve(key)),
    );
  });
}

/** Returns "scrypt$N$r$p$salt$hash" so the settings can change later without breaking old hashes. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const key = await derive(password, salt, PARAMS);
  const { N, r, p } = PARAMS;
  return [
    'scrypt',
    N,
    r,
    p,
    salt.toString('base64'),
    key.toString('base64'),
  ].join('$');
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const [scheme, N, r, p, salt, hash] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const params = { N: Number(N), r: Number(r), p: Number(p) };
  if (![params.N, params.r, params.p].every(Number.isInteger)) return false;
  const expected = Buffer.from(hash, 'base64');
  const actual = await derive(password, Buffer.from(salt, 'base64'), params);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

let dummy: Promise<string> | undefined;

/**
 * A real hash to check against when no account matches, so a login attempt
 * takes the same time whether or not the email/username exists.
 */
export function dummyHash(): Promise<string> {
  dummy ??= hashPassword(randomBytes(16).toString('hex'));
  return dummy;
}
