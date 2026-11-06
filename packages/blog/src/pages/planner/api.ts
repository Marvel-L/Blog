import { PlannerSyncError, parsePlannerResponse, type PlannerTransport } from './sync';

export const apiOrigin = () => {
  const configured = import.meta.env.VITE_PLANNER_API_ORIGIN as string | undefined;
  const origin =
    configured || (import.meta.env.VITE_DEPLOY_TARGET === 'cloud' ? window.location.origin : 'https://43.138.216.53');
  const url = new URL(origin);
  if (
    url.origin !== origin ||
    url.username ||
    url.password ||
    (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)))
  )
    throw new Error('计划云端地址配置无效');
  return origin;
};
export const authorizationStorage = {
  getItem: (key: string) => sessionStorage.getItem(key),
  setItem: (key: string, value: string) => sessionStorage.setItem(key, value),
  removeItem: (key: string) => sessionStorage.removeItem(key),
};
export const plannerTransport = <S>(
  origin: string,
  token: string,
  path: string,
  parse: (raw: string) => S,
): PlannerTransport<S> => {
  const request = async (signal: AbortSignal, mutation?: Parameters<PlannerTransport<S>['save']>[0]) => {
    const response = await fetch(`${origin}/api/v1/planner${path}`, {
      method: mutation ? 'PUT' : 'GET',
      credentials: token ? 'omit' : 'same-origin',
      cache: 'no-store',
      signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]),
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(mutation ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(mutation ? { body: JSON.stringify(mutation) } : {}),
    });
    if (response.status === 409) throw new PlannerSyncError(409, parsePlannerResponse(await response.json(), parse));
    if (!response.ok) throw new PlannerSyncError(response.status);
    return parsePlannerResponse(await response.json(), parse);
  };
  return { load: (signal) => request(signal), save: (mutation, signal) => request(signal, mutation) };
};
