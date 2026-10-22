import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  authorizationKey,
  clearAuthorization,
  parseAuthorization,
  readAuthorization,
  saveAuthorization,
} from './authorization';

const origin = 'https://api.example.com';
const now = 1700000000000;
const token = 'A'.repeat(43);
function storage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
}

describe('Trend 标签页授权', () => {
  afterEach(() => vi.restoreAllMocks());

  it('保存服务端有效期，按 API 来源隔离，读取不延长授权', () => {
    const saved = storage();
    const authorization = parseAuthorization({ token, expiresIn: 3600 }, now);
    expect(authorization.expiresAt).toBe(now + 3600000);
    saveAuthorization(saved, origin, authorization);
    expect(readAuthorization(saved, origin, now + 1000)).toEqual(authorization);
    expect(readAuthorization(saved, 'https://other.example.com', now)).toBeNull();
    clearAuthorization(saved, origin);
    expect(readAuthorization(saved, origin, now)).toBeNull();
  });

  it.each([null, {}, { token: 123, expiresIn: 3600 }, { token: 'invalid', expiresIn: 3600 }])(
    '拒绝无效授权响应 %j',
    (value) => {
      expect(() => parseAuthorization(value, now)).toThrow('授权响应无效');
    },
  );

  it.each([undefined, '3600', 0, -1, 3601, 1.5, NaN])('拒绝无效有效期 %s', (expiresIn) => {
    expect(() => parseAuthorization({ token, expiresIn }, now)).toThrow('授权响应无效');
  });

  it.each([
    '{invalid',
    'null',
    JSON.stringify({ token: 42, expiresAt: now + 1000 }),
    JSON.stringify({ token, expiresAt: 'later' }),
    JSON.stringify({ token, expiresAt: now + 3600001 }),
  ])('损坏缓存删除后如实提示 %s', (raw) => {
    const saved = storage();
    saved.setItem(authorizationKey(origin), raw);
    expect(() => readAuthorization(saved, origin, now)).toThrow('授权已损坏');
    expect(saved.getItem(authorizationKey(origin))).toBeNull();
  });

  it('到期删除记录，不把到期授权返回给请求方', () => {
    const saved = storage();
    saveAuthorization(saved, origin, { token, expiresAt: now });
    expect(() => readAuthorization(saved, origin, now)).toThrow('授权已到期');
    expect(saved.getItem(authorizationKey(origin))).toBeNull();
  });

  it('读取、保存、清除失败都返回真实错误', () => {
    const saved = storage();
    vi.spyOn(saved, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    vi.spyOn(saved, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    vi.spyOn(saved, 'removeItem').mockImplementation(() => {
      throw new Error('denied');
    });
    expect(() => readAuthorization(saved, origin, now)).toThrow('无法读取');
    expect(() => saveAuthorization(saved, origin, { token, expiresAt: now + 1000 })).toThrow('刷新后需重新连接');
    expect(() => clearAuthorization(saved, origin)).toThrow('无法清除');
  });
});
