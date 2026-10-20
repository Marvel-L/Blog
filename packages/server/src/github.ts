import type { ServerConfig } from './config.js';

export interface GitHubIdentity {
  id: string;
  login: string;
  name: string;
}
export type Exchange = (code: string, verifier: string) => Promise<GitHubIdentity>;

export function githubExchange(config: ServerConfig, request: typeof fetch = fetch): Exchange {
  return async (code, verifier) => {
    // Fixed trusted destinations only. Never follow redirects carrying OAuth credentials.
    const tokenResponse = await request('https://github.com/login/oauth/access_token', {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(10000),
      headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: config.githubClientId,
        client_secret: config.githubClientSecret,
        code,
        code_verifier: verifier,
        redirect_uri: `${config.origin}/api/v1/auth/github/callback`,
      }),
    });
    if (!tokenResponse.ok) throw new Error('GitHub token exchange failed');
    const token = (await tokenResponse.json()) as { access_token?: unknown };
    if (typeof token.access_token !== 'string' || !token.access_token) throw new Error('GitHub authorization rejected');
    const userResponse = await request('https://api.github.com/user', {
      redirect: 'error',
      signal: AbortSignal.timeout(10000),
      headers: {
        Authorization: `Bearer ${token.access_token}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'd-blog-server',
      },
    });
    if (!userResponse.ok) throw new Error('GitHub identity lookup failed');
    const user = (await userResponse.json()) as { id?: unknown; login?: unknown; name?: unknown };
    if (
      !Number.isSafeInteger(user.id) ||
      Number(user.id) <= 0 ||
      typeof user.login !== 'string' ||
      !user.login ||
      user.login.length > 100
    ) {
      throw new Error('Invalid GitHub identity');
    }
    return {
      id: String(user.id),
      login: user.login,
      name: typeof user.name === 'string' ? user.name.slice(0, 200) : user.login,
    };
  };
}
