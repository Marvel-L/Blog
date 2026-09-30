import { describe, expect, it } from 'vitest';
import { decryptJsonWithPassword, encryptJsonWithPassword } from './privacy-crypto-core.mjs';

describe('privacy crypto', () => {
  it('可以使用同一密码完成加解密', async () => {
    const payload = await encryptJsonWithPassword(globalThis.crypto, 'Mx179516', { posts: [{ id: 'a' }] });
    const decrypted = await decryptJsonWithPassword(globalThis.crypto, 'Mx179516', payload);
    expect(decrypted).toEqual({ posts: [{ id: 'a' }] });
  });
});
