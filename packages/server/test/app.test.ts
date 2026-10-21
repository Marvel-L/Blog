import { readFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, beforeEach, afterEach, afterAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { Store, hash } from '../src/store.js';
import { loadConfig, type ServerConfig } from '../src/config.js';
import { githubExchange } from '../src/github.js';

const config: ServerConfig = {
  origin: 'https://blog.example.com',
  databaseUrl: 'test',
  githubClientId: 'public-id',
  githubClientSecret: 'private-secret',
  port: 3001,
  secureCookies: true,
};
let db: PGlite;
let store: Store;
let app: Awaited<ReturnType<typeof createApp>>;
const exchange = vi.fn(async () => ({ id: '100', login: 'alice', name: 'Alice' }));
const headers = { origin: config.origin };
const event = () => ({
  eventId: randomUUID(),
  name: 'page_view',
  path: '/Blog/post/hello',
  occurredAt: new Date().toISOString(),
});

beforeAll(async () => {
  db = new PGlite();
  await db.exec(await readFile(new URL('../migrations/001_initial.sql', import.meta.url), 'utf8'));
  store = new Store(async (sql, values) => (await db.query<Record<string, unknown>>(sql, values)).rows);
}, 30000);
beforeEach(async () => {
  await db.exec('TRUNCATE users, oauth_attempts CASCADE');
  exchange.mockReset();
  exchange.mockResolvedValue({ id: '100', login: 'alice', name: 'Alice' });
  app = await createApp(config, store, exchange);
});
afterEach(async () => {
  await app.close();
  vi.restoreAllMocks();
});
afterAll(async () => {
  await db.close();
});

async function authorize() {
  const start = await app.inject({ url: '/api/v1/auth/github/start' });
  const url = new URL(start.headers.location!);
  const state = url.searchParams.get('state')!;
  const oauthCookie = start.cookies.find((cookie) => cookie.name === '__Host-dblog_oauth')!;
  const cookie = `${oauthCookie.name}=${oauthCookie.value}`;
  return { state, cookie, url, start };
}
async function login() {
  const { state, cookie } = await authorize();
  const response = await app.inject({
    url: `/api/v1/auth/github/callback?code=code&state=${state}`,
    headers: { cookie },
  });
  expect(response.statusCode).toBe(302);
  const session = response.cookies.find((item) => item.name === '__Host-dblog_session')!;
  return { cookie: `${session.name}=${session.value}`, token: session.value, response };
}

describe('OAuth and sessions', () => {
  it('creates one-use state and the matching S256 PKCE challenge without broad scopes', async () => {
    const { state, cookie, url, start } = await authorize();
    const verifier = await store.consumeOAuth(state);
    expect(url.origin).toBe('https://github.com');
    expect(url.searchParams.get('code_challenge')).toBe(createHash('sha256').update(verifier!).digest('base64url'));
    expect(url.searchParams.has('scope')).toBe(false);
    expect(cookie).toContain(state);
    expect(start.headers['set-cookie']).toContain('HttpOnly; Secure; SameSite=Lax');
    expect(await store.consumeOAuth(state)).toBeNull();
  });
  it('rejects mismatched/missing browser state and callback replay', async () => {
    const { state, cookie } = await authorize();
    const bad = await app.inject({ url: `/api/v1/auth/github/callback?code=code&state=${state}` });
    expect(bad.statusCode).toBe(400);
    expect(exchange).not.toHaveBeenCalled();
    const url = `/api/v1/auth/github/callback?code=code&state=${state}`;
    expect((await app.inject({ url, headers: { cookie } })).statusCode).toBe(302);
    expect((await app.inject({ url, headers: { cookie } })).statusCode).toBe(400);
    expect(exchange).toHaveBeenCalledTimes(1);
  });
  it('rejects expired authorization attempts', async () => {
    const { state, cookie } = await authorize();
    await db.exec("UPDATE oauth_attempts SET expires_at = now() - interval '1 second'");
    expect(
      (await app.inject({ url: `/api/v1/auth/github/callback?code=code&state=${state}`, headers: { cookie } }))
        .statusCode,
    ).toBe(400);
  });
  it('persists only the session digest and exposes the current identity', async () => {
    const { cookie, token, response } = await login();
    expect(response.headers['set-cookie']).toEqual(
      expect.arrayContaining([expect.stringContaining('HttpOnly; Secure; SameSite=Lax')]),
    );
    expect((await db.query('SELECT token_hash FROM sessions')).rows).toEqual([{ token_hash: hash(token) }]);
    const me = await app.inject({ url: '/api/v1/me', headers: { cookie } });
    expect(me.json().user.login).toBe('alice');
    expect(me.headers['cache-control']).toBe('no-store');
    const recent = await app.inject({ url: '/api/v1/me/events', headers: { cookie } });
    expect(recent.json().events[0].name).toBe('login_success');
  });
  it('rejects CSRF and revokes the server session on logout', async () => {
    const { cookie } = await login();
    expect((await app.inject({ method: 'POST', url: '/api/v1/auth/logout', headers: { cookie } })).statusCode).toBe(
      403,
    );
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/v1/auth/logout',
          headers: { cookie, origin: 'https://evil.example' },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (await app.inject({ method: 'POST', url: '/api/v1/auth/logout', headers: { ...headers, cookie } })).statusCode,
    ).toBe(204);
    expect((await app.inject({ url: '/api/v1/me', headers: { cookie } })).json().user).toBeNull();
  });
  it('does not authenticate expired sessions', async () => {
    const { cookie } = await login();
    await db.exec("UPDATE sessions SET expires_at = now() - interval '1 second'");
    expect((await app.inject({ url: '/api/v1/me', headers: { cookie } })).json().user).toBeNull();
  });
  it('redacts upstream failures and never issues a session on failure', async () => {
    const { state, cookie } = await authorize();
    exchange.mockRejectedValue(new Error('sensitive-token'));
    const response = await app.inject({
      url: `/api/v1/auth/github/callback?code=code&state=${state}`,
      headers: { cookie },
    });
    expect(response.statusCode).toBe(503);
    expect(response.body).not.toContain('sensitive');
    expect((await db.query('SELECT * FROM sessions')).rows).toHaveLength(0);
  });
});

describe('account events', () => {
  it('requires authentication and exact Origin', async () => {
    const payload = { events: [event()] };
    expect((await app.inject({ method: 'POST', url: '/api/v1/events/batch', headers, payload })).statusCode).toBe(401);
    expect((await app.inject({ url: '/api/v1/me/events' })).statusCode).toBe(401);
    expect((await app.inject({ method: 'POST', url: '/api/v1/events/batch', payload })).statusCode).toBe(403);
  });
  it('deduplicates retries and isolates records between accounts', async () => {
    const alice = await login();
    const payload = { events: [event()] };
    const request = {
      method: 'POST' as const,
      url: '/api/v1/events/batch',
      headers: { ...headers, cookie: alice.cookie },
      payload,
    };
    expect((await app.inject(request)).json().accepted).toBe(1);
    expect((await app.inject(request)).json().accepted).toBe(0);
    exchange.mockResolvedValue({ id: '200', login: 'bob', name: 'Bob' });
    const bob = await login();
    const bobEvents = (await app.inject({ url: '/api/v1/me/events', headers: { cookie: bob.cookie } })).json().events;
    expect(bobEvents).toHaveLength(1);
    expect(bobEvents.some((item: { eventId: string }) => item.eventId === payload.events[0].eventId)).toBe(false);
    expect((await app.inject({ ...request, headers: { ...headers, cookie: bob.cookie } })).json().accepted).toBe(1);
  });
  it.each([
    { user_id: 'forged' },
    { name: 'login_success' },
    { path: '/Blog/?token=secret' },
    { path: '/Blog/hello#secret' },
    { path: 'https://evil.example/' },
    { occurredAt: 'not-a-date' },
    { occurredAt: '2000-01-01T00:00:00Z' },
    { occurredAt: '2099-01-01T00:00:00Z' },
    { properties: { token: 'secret' } },
  ])('rejects malformed or spoofed events: %j', async (override) => {
    const { cookie } = await login();
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/v1/events/batch',
          headers: { ...headers, cookie },
          payload: { events: [{ ...event(), ...override }] },
        })
      ).statusCode,
    ).toBe(400);
  });
  it('bounds batch size and prunes expired events and authorizations', async () => {
    const { cookie } = await login();
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/v1/events/batch',
          headers: { ...headers, cookie },
          payload: { events: Array.from({ length: 21 }, event) },
        })
      ).statusCode,
    ).toBe(400);
    await authorize();
    await db.exec(
      "UPDATE user_events SET received_at = now() - interval '91 days'; UPDATE sessions SET expires_at = now() - interval '1 second'; UPDATE oauth_attempts SET expires_at = now() - interval '1 second'",
    );
    await store.cleanup();
    expect((await db.query('SELECT * FROM user_events')).rows).toHaveLength(0);
    expect((await db.query('SELECT * FROM sessions')).rows).toHaveLength(0);
    expect((await db.query('SELECT * FROM oauth_attempts')).rows).toHaveLength(0);
  });
  it('returns 503 when persistence fails instead of pretending success', async () => {
    const { cookie } = await login();
    vi.spyOn(store, 'recordEvents').mockRejectedValue(new Error('db-password'));
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/events/batch',
      headers: { ...headers, cookie },
      payload: { events: [event()] },
    });
    expect(response.statusCode).toBe(503);
    expect(response.body).not.toContain('password');
  });
});

describe('configuration and GitHub transport', () => {
  it('fails closed on missing credentials, paths and insecure production', () => {
    expect(() => loadConfig({})).toThrow('APP_ORIGIN');
    const env = {
      APP_ORIGIN: 'http://localhost:3000',
      DATABASE_URL: 'test',
      GITHUB_CLIENT_ID: 'id',
      GITHUB_CLIENT_SECRET: 'secret',
    };
    expect(loadConfig(env).secureCookies).toBe(false);
    expect(() => loadConfig({ ...env, NODE_ENV: 'production' })).toThrow('HTTPS');
    expect(() => loadConfig({ ...env, APP_ORIGIN: 'https://example.com/Blog' })).toThrow();
    expect(() => loadConfig({ ...env, PORT: 'NaN' })).toThrow('PORT');
  });
  it('exchanges credentials only at fixed endpoints with redirects disabled', async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'private-token' })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 123, login: 'alice', name: null })));
    expect(await githubExchange(config, request)('code', 'verifier')).toEqual({
      id: '123',
      login: 'alice',
      name: 'alice',
    });
    expect(request.mock.calls.map(([url, init]) => [url, init?.redirect])).toEqual([
      ['https://github.com/login/oauth/access_token', 'error'],
      ['https://api.github.com/user', 'error'],
    ]);
    expect(String(request.mock.calls[0][1]?.body)).toContain('code_verifier=verifier');
  });
  it('rejects provider error responses and malformed identities', async () => {
    const denied = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ error: 'access_denied' })));
    await expect(githubExchange(config, denied)('code', 'verifier')).rejects.toThrow('rejected');
    const invalid = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'token' })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'wrong', login: 'alice' })));
    await expect(githubExchange(config, invalid)('code', 'verifier')).rejects.toThrow('identity');
  });
});
