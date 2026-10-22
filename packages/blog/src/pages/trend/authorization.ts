export type Authorization = { token: string; expiresAt: number };
type AuthorizationStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const maxLifetime = 3600;
const validToken = (token: unknown): token is string => typeof token === 'string' && /^[A-Za-z0-9_-]{43}$/.test(token);

export const authorizationKey = (origin: string) => `d-blog-trend-authorization-v1:${origin}`;

export function parseAuthorization(data: unknown, now: number): Authorization {
  const value = data as { token?: unknown; expiresIn?: unknown } | null;
  if (
    !validToken(value?.token) ||
    !Number.isInteger(value?.expiresIn) ||
    (value?.expiresIn as number) < 1 ||
    (value?.expiresIn as number) > maxLifetime
  )
    throw new Error('授权响应无效，请重新连接');
  return { token: value.token, expiresAt: now + (value.expiresIn as number) * 1000 };
}

export function clearAuthorization(storage: AuthorizationStorage, origin: string) {
  try {
    storage.removeItem(authorizationKey(origin));
  } catch {
    throw new Error('无法清除标签页授权，请检查浏览器存储；本次同步已停止');
  }
}

export function readAuthorization(storage: AuthorizationStorage, origin: string, now: number): Authorization | null {
  let raw: string | null;
  try {
    raw = storage.getItem(authorizationKey(origin));
  } catch {
    throw new Error('无法读取标签页授权，请重新连接并检查浏览器存储');
  }
  if (raw === null) return null;
  let value: Authorization | null = null;
  try {
    value = JSON.parse(raw) as Authorization | null;
  } catch {
    // Invalid records are removed below rather than reused as credentials.
  }
  if (
    !validToken(value?.token) ||
    !Number.isSafeInteger(value?.expiresAt) ||
    (value?.expiresAt as number) > now + maxLifetime * 1000
  ) {
    clearAuthorization(storage, origin);
    throw new Error('标签页授权已损坏，请重新连接');
  }
  if (value.expiresAt <= now) {
    clearAuthorization(storage, origin);
    throw new Error('授权已到期，请重新连接');
  }
  return { token: value.token, expiresAt: value.expiresAt };
}

export function saveAuthorization(storage: AuthorizationStorage, origin: string, value: Authorization) {
  try {
    storage.setItem(authorizationKey(origin), JSON.stringify(value));
  } catch {
    throw new Error('无法保存标签页授权；本次可同步，刷新后需重新连接');
  }
}
