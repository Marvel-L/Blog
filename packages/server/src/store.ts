import { createHash, randomBytes, randomUUID } from 'node:crypto';

export const hash = (value: string) => createHash('sha256').update(value).digest('hex');
export const secret = () => randomBytes(32).toString('base64url');
export type Query = (sql: string, values?: unknown[]) => Promise<Record<string, unknown>[]>;
export interface User {
  id: string;
  login: string;
  name: string;
}
export interface PageEvent {
  eventId: string;
  name: 'page_view';
  path: string;
  occurredAt: string;
}

/** All queries are parameterized. A store never accepts a user identity from event payloads. */
export class Store {
  constructor(private query: Query) {}

  async ready() {
    await this.query('SELECT 1 FROM users LIMIT 1');
  }

  async beginOAuth(state: string, verifier: string) {
    await this.query(
      `INSERT INTO oauth_attempts(state_hash, verifier, expires_at) VALUES ($1, $2, now() + interval '10 minutes')`,
      [hash(state), verifier],
    );
  }

  async consumeOAuth(state: string): Promise<string | null> {
    const rows = await this.query(
      'DELETE FROM oauth_attempts WHERE state_hash = $1 AND expires_at > now() RETURNING verifier',
      [hash(state)],
    );
    return rows.length ? String(rows[0].verifier) : null;
  }

  async login(identity: { id: string; login: string; name: string }) {
    const [row] = await this.query(
      `INSERT INTO users(id, github_id, login, name) VALUES ($1, $2, $3, $4)
       ON CONFLICT (github_id) DO UPDATE SET login = EXCLUDED.login, name = EXCLUDED.name
       RETURNING id, login, name`,
      [randomUUID(), identity.id, identity.login, identity.name],
    );
    const user = row as unknown as User;
    const token = secret();
    // Session and server-generated login event succeed or fail in the same SQL statement.
    await this.query(
      `WITH session AS (
         INSERT INTO sessions(token_hash, user_id, expires_at) VALUES ($1, $2, now() + interval '7 days') RETURNING user_id
       ) INSERT INTO user_events(user_id, event_id, name, path, occurred_at)
         SELECT user_id, $3, 'login_success', '/api/v1/auth/github/callback', now() FROM session`,
      [hash(token), user.id, randomUUID()],
    );
    return { token, user };
  }

  async findUser(token: string): Promise<User | null> {
    const [row] = await this.query(
      `SELECT u.id, u.login, u.name FROM users u JOIN sessions s ON s.user_id = u.id
       WHERE s.token_hash = $1 AND s.expires_at > now()`,
      [hash(token)],
    );
    return row ? (row as unknown as User) : null;
  }

  async logout(token: string) {
    await this.query('DELETE FROM sessions WHERE token_hash = $1', [hash(token)]);
  }

  async recordEvents(userId: string, events: PageEvent[]) {
    const rows = await this.query(
      `INSERT INTO user_events(user_id, event_id, name, path, occurred_at)
       SELECT $1, e."eventId"::uuid, e.name, e.path, e."occurredAt"::timestamptz
       FROM jsonb_to_recordset($2::jsonb) AS e("eventId" text, name text, path text, "occurredAt" text)
       ON CONFLICT (user_id, event_id) DO NOTHING RETURNING event_id`,
      [userId, JSON.stringify(events)],
    );
    return rows.length;
  }

  async recentEvents(userId: string) {
    return this.query(
      `SELECT event_id AS "eventId", name, path, occurred_at AS "occurredAt", received_at AS "receivedAt"
       FROM user_events WHERE user_id = $1 ORDER BY received_at DESC, event_id DESC LIMIT 20`,
      [userId],
    );
  }

  async cleanup() {
    await this.query('DELETE FROM oauth_attempts WHERE expires_at <= now()');
    await this.query('DELETE FROM sessions WHERE expires_at <= now()');
    await this.query("DELETE FROM user_events WHERE received_at < now() - interval '90 days'");
  }
}
