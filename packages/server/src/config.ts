export interface ServerConfig {
  origin: string;
  databaseUrl: string;
  githubClientId: string;
  githubClientSecret: string;
  port: number;
  secureCookies: boolean;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const required = (name: string) => {
    const value = env[name]?.trim();
    if (!value) throw new Error(`Missing configuration: ${name}`);
    return value;
  };
  const url = new URL(required('APP_ORIGIN'));
  const localHttp = url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname);
  if (
    (url.protocol !== 'https:' && !localHttp) ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    throw new Error('APP_ORIGIN must be an HTTPS origin (HTTP only on localhost)');
  }
  if (env.NODE_ENV === 'production' && localHttp) throw new Error('Production requires HTTPS');
  const port = Number(env.PORT ?? 3001);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT');
  return {
    origin: url.origin,
    databaseUrl: required('DATABASE_URL'),
    githubClientId: required('GITHUB_CLIENT_ID'),
    githubClientSecret: required('GITHUB_CLIENT_SECRET'),
    port,
    secureCookies: url.protocol === 'https:',
  };
}
