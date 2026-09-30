import { decryptJsonWithPassword } from './privacy-crypto-core.mjs';

export interface EncryptedPrivacyPayload {
  version: number;
  salt: string;
  iv: string;
  ciphertext: string;
}

const getRuntimeCrypto = () => {
  if (typeof globalThis === 'undefined' || !globalThis.crypto) {
    throw new Error('Privacy crypto is unavailable in this runtime.');
  }

  return globalThis.crypto;
};

export const decryptPrivacyPayload = async <T>(password: string, payload: EncryptedPrivacyPayload): Promise<T> =>
  decryptJsonWithPassword(getRuntimeCrypto(), password, payload) as Promise<T>;
