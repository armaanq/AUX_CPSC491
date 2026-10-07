import { hashPassword, verifyPassword } from './password.js';

describe('password hashing', () => {
  it('stores a salted scrypt hash, never the password itself', async () => {
    const hash = await hashPassword('correct horse');
    expect(hash).toMatch(
      /^scrypt\$32768\$8\$3\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/,
    );
    expect(hash).not.toContain('correct horse');
  });

  it('gives the same password a different hash each time', async () => {
    expect(await hashPassword('same password')).not.toBe(
      await hashPassword('same password'),
    );
  });

  it('accepts the right password and rejects others', async () => {
    const hash = await hashPassword('correct horse');
    expect(await verifyPassword('correct horse', hash)).toBe(true);
    expect(await verifyPassword('Correct horse', hash)).toBe(false);
    expect(await verifyPassword('', hash)).toBe(false);
  });

  it('treats differently-encoded but identical characters as the same password', async () => {
    const oneCharacter = 'Beyonc\u00e9'; // é
    const twoCharacters = 'Beyonce\u0301'; // e + combining accent
    expect(twoCharacters).not.toBe(oneCharacter);
    const hash = await hashPassword(oneCharacter);
    expect(await verifyPassword(twoCharacters, hash)).toBe(true);
  });

  it('rejects malformed stored hashes instead of throwing', async () => {
    expect(await verifyPassword('x', '')).toBe(false);
    expect(await verifyPassword('x', 'bcrypt$whatever')).toBe(false);
    expect(await verifyPassword('x', 'scrypt$abc$8$3$c2FsdA==$aGFzaA==')).toBe(
      false,
    );
  });
});
