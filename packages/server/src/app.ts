import { createHash, timingSafeEqual } from 'node:crypto';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import type { ServerConfig } from './config.js';
import { githubExchange, type Exchange } from './github.js';
import { hash, secret, type Store, type PageEvent } from './store.js';

const sameSecret = (a: string, b: string) => timingSafeEqual(Buffer.from(hash(a)), Buffer.from(hash(b)));

export async function createApp(config: ServerConfig, store: Store, exchange: Exchange = githubExchange(config)) {
  // Disable automatic request logging: callback URLs contain authorization codes.
  const app = Fastify({ logger: false, bodyLimit: 32768, ajv: { customOptions: { removeAdditional: false } } });
  await app.register(cookie);
  await app.register(rateLimit, { max: 120, timeWindow: '1 minute' });
  const sessionCookie = config.secureCookies ? '__Host-dblog_session' : 'dblog_session_dev';
  const stateCookie = config.secureCookies ? '__Host-dblog_oauth' : 'dblog_oauth_dev';
  const cookieOptions = { path: '/', httpOnly: true, secure: config.secureCookies, sameSite: 'lax' as const };
  const userFor = (token?: string) =>
    token && /^[A-Za-z0-9_-]{43}$/.test(token) ? store.findUser(token) : Promise.resolve(null);

  app.addHook('onRequest', async (req, reply) => {
    reply.header('Cache-Control', 'no-store').header('X-Content-Type-Options', 'nosniff');
    // Same-origin API; fail closed even when the browser omits Origin on unsafe requests.
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.headers.origin !== config.origin) {
      return reply.code(403).send({ error: '请求来源不受信任' });
    }
  });
  app.setErrorHandler((error, _req, reply) => {
    const code = error instanceof Error && 'statusCode' in error ? Number(error.statusCode) : 0;
    const status = code >= 400 && code < 500 ? code : 503;
    reply.code(status).send({ error: status === 503 ? '服务暂时不可用，请稍后重试' : '请求无效或过于频繁' });
  });

  app.get('/api/v1/health', async () => {
    await store.ready();
    return { status: 'ok', version: '0.1.0' };
  });
  app.get('/api/v1/me', async (req) => ({ user: await userFor(req.cookies[sessionCookie]) }));

  app.get(
    '/api/v1/auth/github/start',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (_req, reply) => {
      const state = secret();
      const verifier = secret();
      await store.beginOAuth(state, verifier);
      const url = new URL('https://github.com/login/oauth/authorize');
      url.search = new URLSearchParams({
        client_id: config.githubClientId,
        redirect_uri: `${config.origin}/api/v1/auth/github/callback`,
        state,
        code_challenge: createHash('sha256').update(verifier).digest('base64url'),
        code_challenge_method: 'S256',
      }).toString();
      reply.setCookie(stateCookie, state, { ...cookieOptions, maxAge: 600 });
      return reply.redirect(url.href);
    },
  );

  app.get<{ Querystring: { code?: string; state?: string } }>('/api/v1/auth/github/callback', async (req, reply) => {
    reply.clearCookie(stateCookie, cookieOptions);
    const { code, state } = req.query;
    const browserState = req.cookies[stateCookie];
    if (
      typeof state !== 'string' ||
      !/^[A-Za-z0-9_-]{43}$/.test(state) ||
      !browserState ||
      !sameSecret(state, browserState)
    ) {
      return reply.code(400).send({ error: '登录校验失败，请重新登录' });
    }
    const verifier = await store.consumeOAuth(state);
    if (!verifier || typeof code !== 'string' || !code || code.length > 512) {
      return reply.code(400).send({ error: '授权已失效或被取消，请重新登录' });
    }
    const identity = await exchange(code, verifier);
    const login = await store.login(identity);
    // Replacing a browser session also revokes its previous server session.
    if (req.cookies[sessionCookie]) await store.logout(req.cookies[sessionCookie]);
    reply.setCookie(sessionCookie, login.token, { ...cookieOptions, maxAge: 7 * 24 * 3600 });
    return reply.redirect('/Blog/');
  });

  app.post('/api/v1/auth/logout', async (req, reply) => {
    const token = req.cookies[sessionCookie];
    if (token) await store.logout(token);
    reply.clearCookie(sessionCookie, cookieOptions);
    return reply.code(204).send();
  });

  app.post<{ Body: { events: PageEvent[] } }>(
    '/api/v1/events/batch',
    {
      schema: {
        body: {
          type: 'object',
          required: ['events'],
          additionalProperties: false,
          properties: {
            events: {
              type: 'array',
              minItems: 1,
              maxItems: 20,
              items: {
                type: 'object',
                required: ['eventId', 'name', 'path', 'occurredAt'],
                additionalProperties: false,
                properties: {
                  eventId: { type: 'string', format: 'uuid' },
                  name: { const: 'page_view' },
                  path: { type: 'string', maxLength: 500, pattern: '^/Blog/[^?#\\\\\\x00-\\x20]*$' },
                  occurredAt: { type: 'string', format: 'date-time' },
                },
              },
            },
          },
        },
      },
    },
    async (req, reply) => {
      const user = await userFor(req.cookies[sessionCookie]);
      if (!user) return reply.code(401).send({ error: '请先登录' });
      const now = Date.now();
      if (
        req.body.events.some((event) => {
          const time = Date.parse(event.occurredAt);
          return !Number.isFinite(time) || time > now + 300000 || time < now - 86400000;
        })
      )
        return reply.code(400).send({ error: '事件时间无效' });
      const accepted = await store.recordEvents(user.id, req.body.events);
      return { accepted };
    },
  );

  app.get('/api/v1/me/events', async (req, reply) => {
    const user = await userFor(req.cookies[sessionCookie]);
    if (!user) return reply.code(401).send({ error: '请先登录' });
    return { events: await store.recentEvents(user.id) };
  });
  return app;
}
