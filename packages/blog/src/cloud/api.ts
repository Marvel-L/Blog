export interface CloudUser {
  id: string;
  login: string;
  name: string;
  username?: string;
  githubBound?: boolean;
}
export class CloudError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export interface CloudEvent {
  eventId: string;
  name: string;
  path: string;
  occurredAt: string;
}

export async function cloudRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api/v1${path}`, {
    ...init,
    signal: init.signal ?? AbortSignal.timeout(10000),
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers },
  });
  if (!response.ok) {
    let message = response.status === 401 ? '登录已失效，请重新登录' : '云端服务暂时不可用，请重试';
    let code = '';
    // Only safe application errors, never raw upstream responses or HTML.
    try {
      const data = (await response.json()) as { error?: unknown; code?: unknown };
      if (typeof data.code === 'string') code = data.code;
      if (
        (path.startsWith('/auth/account/') || code === 'github_binding_required') &&
        typeof data.error === 'string' &&
        data.error.length <= 240
      )
        message = data.error;
    } catch {
      /* Retain the safe fallback for non-JSON failures. */
    }
    if (code === 'origin_mismatch') message = '当前访问地址与服务端配置不一致，请使用配置的站点地址';
    if (code === 'rate_limited') message = '请求过于频繁，请等待 60 秒后重试';
    throw new CloudError(response.status, code, message);
  }
  if (response.status === 204) return undefined as T;
  if (response.headers.get('content-type')?.includes('text/html')) {
    throw new Error('账号 API 返回了博客页面，请检查云端服务是否启动及开发代理配置');
  }
  return response.json() as Promise<T>;
}

/** Payload intentionally excludes query strings, page titles and user identity. */
export function pageEvent(path: string) {
  return { eventId: crypto.randomUUID(), name: 'page_view' as const, path, occurredAt: new Date().toISOString() };
}
