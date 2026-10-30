import { UNAUTHORIZED_MESSAGE } from './anki-api';

export interface AISettings {
  available: boolean;
  configured: boolean;
  maskedKey: string;
  updatedAt: string | null;
}
export interface AIResult {
  score: number;
  summary: string;
  strengths: string[];
  issues: string[];
  suggestions: string[];
}
export interface AIDiagnostic {
  stage: string;
  detail: string;
  httpStatus?: number;
  requestId?: string;
  responseReceived: boolean;
  responseComplete: boolean;
  responseTruncated: boolean;
  responseBody?: string;
  finishReason?: string;
  modelReturned?: string;
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}
export type AIStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'unknown';
export interface AICheck {
  id: string;
  cardId: string;
  cardVersion: number;
  status: AIStatus;
  questionSnapshot?: string;
  answerSnapshot?: string;
  systemPromptSnapshot?: string;
  userPromptSnapshot?: string;
  assistantContent?: string;
  promptVersion: string;
  model: string;
  score: number | null;
  result?: AIResult;
  errorCode?: string;
  diagnostic?: AIDiagnostic;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
}
export interface AICheckList {
  checks: AICheck[];
  nextCursor: string;
  active?: AICheck;
}
export class AIRequestError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
async function request(path: string, init: RequestInit = {}): Promise<unknown> {
  const response = await fetch(`/api/v1${path}`, {
    ...init,
    signal: init.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(10000)]) : AbortSignal.timeout(10000),
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers },
  });
  if (response.status === 401) throw new AIRequestError('UNAUTHORIZED', UNAUTHORIZED_MESSAGE, 401);
  if (response.status === 204 && response.ok) return null;
  const isJSON = response.headers.get('content-type')?.includes('application/json');
  if (!isJSON)
    throw new AIRequestError('SERVICE_UNAVAILABLE', 'AI API 未返回有效数据，请检查后端服务', response.status);
  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new AIRequestError('INVALID_RESPONSE', 'AI 响应格式无效', response.status);
  }
  if (!response.ok) {
    const error = object(data) ? data.error : undefined;
    throw new AIRequestError(
      object(error) && typeof error.code === 'string' ? error.code : 'SERVICE_UNAVAILABLE',
      object(error) && typeof error.message === 'string'
        ? error.message
        : typeof error === 'string'
          ? error
          : 'AI 服务暂时不可用',
      response.status,
    );
  }
  return data;
}
function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
export function validResult(value: unknown): value is AIResult {
  return (
    object(value) &&
    typeof value.score === 'number' &&
    Number.isInteger(value.score) &&
    value.score >= 0 &&
    value.score <= 100 &&
    typeof value.summary === 'string' &&
    value.summary.trim().length > 0 &&
    ['strengths', 'issues', 'suggestions'].every(
      (key) =>
        Array.isArray(value[key]) && (value[key] as unknown[]).every((text) => typeof text === 'string' && text.trim()),
    ) &&
    (value.suggestions as unknown[]).length > 0
  );
}
export function validDiagnostic(value: unknown): value is AIDiagnostic {
  if (!object(value)) return false;
  const usage = value.usage;
  return (
    typeof value.stage === 'string' &&
    [
      'request',
      'transport',
      'response_body',
      'http_status',
      'response_envelope',
      'response_finish',
      'result_validation',
    ].includes(value.stage) &&
    typeof value.detail === 'string' &&
    value.detail.trim().length > 0 &&
    value.detail.length <= 1000 &&
    ['responseReceived', 'responseComplete', 'responseTruncated'].every((key) => typeof value[key] === 'boolean') &&
    (value.httpStatus === undefined ||
      (typeof value.httpStatus === 'number' &&
        Number.isInteger(value.httpStatus) &&
        value.httpStatus >= 100 &&
        value.httpStatus <= 599)) &&
    ['requestId', 'finishReason', 'modelReturned'].every(
      (key) =>
        value[key] === undefined || (typeof value[key] === 'string' && /^[a-zA-Z0-9._:-]{1,200}$/.test(value[key])),
    ) &&
    (value.responseBody === undefined ||
      (typeof value.responseBody === 'string' && value.responseBody.length <= 16384)) &&
    (value.usage === undefined ||
      (object(usage) &&
        ['prompt_tokens', 'completion_tokens', 'total_tokens'].every(
          (key) => typeof usage![key] === 'number' && Number.isSafeInteger(usage![key]) && (usage![key] as number) >= 0,
        )))
  );
}
function check(value: unknown, detail = false): AICheck {
  if (
    !object(value) ||
    typeof value.id !== 'string' ||
    !value.id ||
    typeof value.cardId !== 'string' ||
    typeof value.cardVersion !== 'number' ||
    !Number.isInteger(value.cardVersion) ||
    typeof value.status !== 'string' ||
    !['queued', 'running', 'succeeded', 'failed', 'unknown'].includes(value.status) ||
    typeof value.createdAt !== 'string' ||
    Number.isNaN(Date.parse(value.createdAt)) ||
    !(
      value.score === null ||
      (typeof value.score === 'number' && Number.isInteger(value.score) && value.score >= 0 && value.score <= 100)
    )
  ) {
    throw new AIRequestError('INVALID_RESPONSE', '评分记录响应无效', 200);
  }
  if (
    value.status === 'succeeded' &&
    (value.score === null || (detail && (!validResult(value.result) || value.result.score !== value.score)))
  ) {
    throw new AIRequestError('INVALID_RESPONSE', '评分结果响应无效', 200);
  }
  if (value.status !== 'succeeded' && value.score !== null)
    throw new AIRequestError('INVALID_RESPONSE', '失败记录不应包含得分', 200);
  if (value.diagnostic !== undefined && !validDiagnostic(value.diagnostic))
    throw new AIRequestError('INVALID_RESPONSE', '检查诊断响应无效', 200);
  return value as unknown as AICheck;
}
export async function fetchAISettings(signal?: AbortSignal): Promise<AISettings> {
  const value = await request('/anki/ai/settings', { signal });
  if (
    !object(value) ||
    typeof value.configured !== 'boolean' ||
    typeof value.available !== 'boolean' ||
    typeof value.maskedKey !== 'string'
  )
    throw new AIRequestError('INVALID_RESPONSE', 'AI 配置响应无效', 200);
  return value as unknown as AISettings;
}
export async function saveAIKey(apiKey: string, signal?: AbortSignal): Promise<void> {
  await request('/anki/ai/settings', { method: 'PUT', body: JSON.stringify({ apiKey }), signal });
}
export async function deleteAIKey(signal?: AbortSignal): Promise<void> {
  await request('/anki/ai/settings', { method: 'DELETE', signal });
}
export async function createAICheck(
  cardId: string,
  version: number,
  mutationId: string,
  signal?: AbortSignal,
): Promise<AICheck> {
  const value = await request(`/anki/cards/${encodeURIComponent(cardId)}/ai-checks`, {
    method: 'POST',
    body: JSON.stringify({ version, mutationId }),
    signal,
  });
  return check(object(value) ? value.check : undefined);
}
export async function fetchAICheck(id: string, signal?: AbortSignal): Promise<AICheck> {
  const value = await request(`/anki/ai-checks/${encodeURIComponent(id)}`, { signal });
  return check(object(value) ? value.check : undefined, true);
}
export async function fetchAIChecks(cardId: string, cursor = '', signal?: AbortSignal): Promise<AICheckList> {
  const value = await request(
    `/anki/cards/${encodeURIComponent(cardId)}/ai-checks?limit=20${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
    { signal },
  );
  if (!object(value) || !Array.isArray(value.checks) || typeof value.nextCursor !== 'string')
    throw new AIRequestError('INVALID_RESPONSE', '历史列表响应无效', 200);
  return {
    checks: value.checks.map((entry) => check(entry)),
    nextCursor: value.nextCursor,
    active: value.active ? check(value.active) : undefined,
  };
}
export async function deleteAICheck(id: string, signal?: AbortSignal): Promise<void> {
  await request(`/anki/ai-checks/${encodeURIComponent(id)}`, { method: 'DELETE', signal });
}
export function checkRunning(value: AICheck | null | undefined) {
  return value?.status === 'queued' || value?.status === 'running';
}
export function aiErrorMessage(code?: string): string {
  const messages: Record<string, string> = {
    AI_KEY_INVALID: 'DeepSeek API Key 无效，请更新配置。',
    AI_BALANCE_INSUFFICIENT: 'DeepSeek 账户额度不足，请检查余额。',
    AI_RATE_LIMITED: 'DeepSeek 请求受限，请稍后手动重新检查。',
    AI_TIMEOUT: '调用超时，是否已产生费用无法确定；没有自动重发。',
    AI_REQUEST_UNKNOWN: '请求结果不确定，没有自动重发；重新开始可能再次产生费用。',
    AI_UPSTREAM_ERROR: 'DeepSeek 服务暂时不可用，没有自动重试。',
    AI_KEY_CHANGED: '排队期间 API Key 已更新，请重新开始检查。',
    AI_KEY_REMOVED: 'API Key 已删除，未继续排队检查。',
    AI_KEY_DECRYPT_FAILED: '密钥无法解密，请检查服务配置或重新保存 Key。',
    AI_QUEUE_EXPIRED: '排队任务已过期，请重新开始。',
    AI_RESULT_INVALID: 'AI 未返回有效的 0–100 分与明确建议，本次无有效评分。',
    AI_RESPONSE_INCOMPLETE: 'AI 输出被截断或中止，本次无有效评分。',
    AI_RESPONSE_INVALID: 'AI 返回格式无效，本次无有效评分。',
    AI_RESPONSE_TOO_LARGE: 'AI 响应过大，本次无有效评分。',
  };
  return messages[code ?? ''] ?? '检查失败，本次没有有效得分。';
}
export function formatAICopy(value: AICheck): string {
  const result = value.result;
  const evaluation = result
    ? `得分：${result.score}/100\n总体评价：${result.summary}\n优点：\n${result.strengths.map((s) => `- ${s}`).join('\n')}\n问题：\n${result.issues.map((s) => `- ${s}`).join('\n')}\n建议：\n${result.suggestions.map((s) => `- ${s}`).join('\n')}`
    : aiErrorMessage(value.errorCode);
  return `原问题：\n${value.questionSnapshot ?? ''}\n\n原答案：\n${value.answerSnapshot ?? ''}\n\nAI 评价：\n${evaluation}`;
}
