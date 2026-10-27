export interface CloudUser {
  id: string;
  login: string;
  name: string;
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
  if (!response.ok) throw new Error(response.status === 401 ? '登录已失效，请重新登录' : '云端服务暂时不可用，请重试');
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
