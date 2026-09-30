const encoder = new TextEncoder();
const decoder = new TextDecoder();

export const PRIVACY_CRYPTO_VERSION = 1;
export const PRIVACY_CRYPTO_ITERATIONS = 120000;
export const PRIVACY_CRYPTO_SALT_BYTES = 16;
export const PRIVACY_CRYPTO_IV_BYTES = 12;

const ensureCrypto = (cryptoLike) => {
  if (!cryptoLike?.subtle || typeof cryptoLike.getRandomValues !== 'function') {
    throw new Error('Privacy crypto is unavailable in this environment.');
  }
  return cryptoLike;
};

export const bytesToBase64 = (bytes) => {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }

  let binary = '';
  bytes.forEach((value) => {
    binary += String.fromCharCode(value);
  });
  return btoa(binary);
};

export const base64ToBytes = (value) => {
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(value, 'base64'));
  }

  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
};

const deriveAesKey = async (cryptoLike, password, salt) => {
  const keyMaterial = await cryptoLike.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveKey']);
  return cryptoLike.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: PRIVACY_CRYPTO_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
};

export const encryptJsonWithPassword = async (cryptoLike, password, payload) => {
  const runtimeCrypto = ensureCrypto(cryptoLike);
  const salt = runtimeCrypto.getRandomValues(new Uint8Array(PRIVACY_CRYPTO_SALT_BYTES));
  const iv = runtimeCrypto.getRandomValues(new Uint8Array(PRIVACY_CRYPTO_IV_BYTES));
  const key = await deriveAesKey(runtimeCrypto, password, salt);
  const plaintext = encoder.encode(JSON.stringify(payload));
  const ciphertext = new Uint8Array(await runtimeCrypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext));

  return {
    version: PRIVACY_CRYPTO_VERSION,
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(ciphertext),
  };
};

export const decryptJsonWithPassword = async (cryptoLike, password, encryptedPayload) => {
  const runtimeCrypto = ensureCrypto(cryptoLike);

  if (
    !encryptedPayload ||
    encryptedPayload.version !== PRIVACY_CRYPTO_VERSION ||
    typeof encryptedPayload.salt !== 'string' ||
    typeof encryptedPayload.iv !== 'string' ||
    typeof encryptedPayload.ciphertext !== 'string'
  ) {
    throw new Error('Invalid encrypted privacy payload.');
  }

  const salt = base64ToBytes(encryptedPayload.salt);
  const iv = base64ToBytes(encryptedPayload.iv);
  const ciphertext = base64ToBytes(encryptedPayload.ciphertext);
  const key = await deriveAesKey(runtimeCrypto, password, salt);

  try {
    const plaintext = await runtimeCrypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
    return JSON.parse(decoder.decode(plaintext));
  } catch {
    throw new Error('Failed to decrypt privacy payload.');
  }
};
