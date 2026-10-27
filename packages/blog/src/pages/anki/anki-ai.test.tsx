import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AnkiAIDialog } from './AnkiAIDialog';
import { AnkiDeckDetail } from './AnkiDeckDetail';
import { formatAICopy, validResult, type AICheck } from './anki-ai-api';
import type { AnkiCard } from './anki-api';

vi.mock('@/components/SlideModal', () => ({
  SlideModal: ({ children }: { children: React.ReactNode }) => <div role="dialog">{children}</div>,
}));
const card: AnkiCard = {
  id: 'card1',
  deckId: 'deck1',
  question: 'channel 关闭职责',
  answer: '当前答案',
  dueAt: '2030-01-01T00:00:00Z',
  intervalDays: 6,
  repetitions: 2,
  easeFactor: 2.5,
  reviewCount: 2,
  version: 3,
};
const record: AICheck = {
  id: 'check1',
  cardId: card.id,
  cardVersion: 2,
  status: 'succeeded',
  questionSnapshot: '原问题',
  answerSnapshot: '原答案',
  userPromptSnapshot: '原完整提问',
  promptVersion: 'v1',
  model: 'fixture',
  score: 72,
  result: { score: 72, summary: '正确但不完整', strengths: [], issues: ['缺少边界'], suggestions: ['补充关闭语义'] },
  createdAt: '2026-10-27T01:00:00Z',
};
const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const fixture = (options: { configured?: boolean; failure?: boolean } = {}) => {
  let list = [record];
  const request = vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
    const url = String(input);
    if (url.endsWith('/tags')) return response({ tags: [] });
    if (url.endsWith('/cards')) return response({ cards: [card] });
    if (url.endsWith('/ai/settings'))
      return response({
        configured: options.configured !== false,
        available: true,
        maskedKey: '••••test',
        updatedAt: null,
      });
    if (init?.method === 'POST') {
      if (options.failure) return response({ error: { code: 'CARD_VERSION_CONFLICT', message: '卡片已更新' } }, 409);
      return response({ check: { ...record, id: 'new-check' } }, 202);
    }
    if (init?.method === 'DELETE') {
      list = [];
      return new Response(null, { status: 204 });
    }
    if (url.includes('?limit=')) return response({ checks: list, nextCursor: '' });
    return response({ check: record });
  });
  vi.stubGlobal('fetch', request);
  return request;
};
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe('Anki AI Check', () => {
  it('入口与历史不会提交评分，历史在弹窗内只读，复制使用旧快照并可删除', async () => {
    const request = fixture();
    const copy = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText: copy } });
    render(<AnkiAIDialog card={card} onClose={vi.fn()} />);
    const start = await screen.findByRole('button', { name: '开始 Check' });
    await waitFor(() => expect(start).toBeEnabled());
    expect(request.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: '查看 AI 历史' }));
    await screen.findByText('原答案');
    expect(within(screen.getByRole('dialog')).queryByRole('textbox')).not.toBeInTheDocument();
    expect(request.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: '复制本轮问答' }));
    await waitFor(() => expect(copy).toHaveBeenCalledTimes(1));
    expect(copy.mock.calls[0][0]).toContain('原答案');
    expect(copy.mock.calls[0][0]).not.toContain('当前答案');
    fireEvent.click(screen.getByRole('button', { name: '删除此记录' }));
    await screen.findByText('当前 AI 记录已删除，其余记录与复习进度保留。');
    expect(request.mock.calls.filter(([, init]) => init?.method === 'DELETE')).toHaveLength(1);
  });
  it('仅点击开始才 POST，双击只有一条且不提交问题、答案或历史', async () => {
    const request = fixture();
    render(<AnkiAIDialog card={card} onClose={vi.fn()} />);
    const start = await screen.findByRole('button', { name: '开始 Check' });
    await waitFor(() => expect(start).toBeEnabled());
    fireEvent.click(start);
    fireEvent.click(start);
    await screen.findByText('正确但不完整');
    const posts = request.mock.calls.filter(([, init]) => init?.method === 'POST');
    expect(posts).toHaveLength(1);
    expect(JSON.parse(String(posts[0][1]?.body))).toEqual({ version: 3, mutationId: expect.any(String) });
    expect(posts[0][1]).toMatchObject({ credentials: 'same-origin', cache: 'no-store' });
  });
  it('未配置 Key 时只进入设置，保存不会自动检查', async () => {
    const request = fixture({ configured: false });
    render(<AnkiAIDialog card={card} onClose={vi.fn()} />);
    const start = screen.getByRole('button', { name: '开始 Check' });
    await waitFor(() => expect(start).toBeEnabled());
    fireEvent.click(start);
    await screen.findByText('你的 DeepSeek API Key');
    fireEvent.change(screen.getByLabelText('你的 DeepSeek API Key'), { target: { value: 'test-private-key' } });
    fireEvent.click(screen.getByRole('button', { name: '保存配置' }));
    await screen.findByText('配置已加密保存；未自动检查，也未验证厂商凭据。');
    expect(request.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(0);
    expect(request.mock.calls.filter(([, init]) => init?.method === 'PUT')).toHaveLength(1);
  });
  it('卡片编辑旁只有 Ai Check，打开/关闭保持答案与练习计数', async () => {
    fixture();
    const onRecorded = vi.fn();
    render(
      <AnkiDeckDetail
        deck={{ id: 'deck1', categoryId: 'cat1', name: '测试库', total: 1, learned: 1, stable: 0, due: 0 }}
        categoryName="Go"
        onBack={vi.fn()}
        onNewCard={vi.fn()}
        onEditCard={vi.fn()}
        onBrowse={vi.fn()}
        onPractice={vi.fn()}
        onRecorded={onRecorded}
      />,
    );
    fireEvent.click(await screen.findByRole('button', { name: '查看答案' }));
    const check = screen.getByRole('button', { name: 'Ai Check' });
    expect(check.previousElementSibling).toHaveTextContent('编辑');
    expect(check).toHaveClass('anki-card-tool-button');
    expect(check.previousElementSibling).toHaveClass('anki-card-tool-button');
    fireEvent.click(check);
    expect(screen.getByRole('region', { name: '卡片答案' })).toHaveTextContent('当前答案');
    fireEvent.click(screen.getByRole('button', { name: '关闭' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: '卡片答案' })).toHaveTextContent('当前答案');
    expect(onRecorded).not.toHaveBeenCalled();
  });
  it('卸载取消请求，迟到结果不再产生状态操作', async () => {
    let release: ((value: Response) => void) | undefined;
    const request = vi.fn<typeof fetch>().mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          release = resolve;
        }),
    );
    vi.stubGlobal('fetch', request);
    const mounted = render(<AnkiAIDialog onClose={vi.fn()} />);
    mounted.unmount();
    expect(request.mock.calls[0][1]?.signal?.aborted).toBe(true);
    await act(async () =>
      release?.(response({ available: true, configured: true, maskedKey: '••••', updatedAt: null })),
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
  it('提交结果不确定时重查复用原 mutationId，不自动追加调用', async () => {
    const request = fixture();
    const original = request.getMockImplementation()!;
    let attempts = 0;
    request.mockImplementation(async (url, init) => {
      if (init?.method === 'POST' && ++attempts === 1) throw new TypeError('network');
      return original(url, init);
    });
    render(<AnkiAIDialog card={card} onClose={vi.fn()} />);
    const start = screen.getByRole('button', { name: '开始 Check' });
    await waitFor(() => expect(start).toBeEnabled());
    fireEvent.click(start);
    await screen.findByRole('button', { name: '重查本次提交' });
    expect(request.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: '重查本次提交' }));
    await screen.findByText('正确但不完整');
    const posts = request.mock.calls.filter(([, init]) => init?.method === 'POST');
    expect(posts).toHaveLength(2);
    expect(posts[0][1]?.body).toBe(posts[1][1]?.body);
  });
  it('业务版本错误显示真实错误，不伪造得分', async () => {
    const request = fixture({ failure: true });
    render(<AnkiAIDialog card={card} onClose={vi.fn()} />);
    const start = screen.getByRole('button', { name: '开始 Check' });
    await waitFor(() => expect(start).toBeEnabled());
    fireEvent.click(start);
    await screen.findByText('卡片已更新');
    expect(screen.queryByText('正确但不完整')).not.toBeInTheDocument();
    expect(request.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1);
  });
  it('账号配置恢复后不要求重新输入，仅主动修改显示空输入且取消不写入', async () => {
    const request = fixture();
    const mounted = render(<AnkiAIDialog onClose={vi.fn()} />);
    await screen.findByRole('button', { name: '修改 API Key' });
    expect(screen.queryByLabelText('你的 DeepSeek API Key')).not.toBeInTheDocument();
    mounted.unmount();
    render(<AnkiAIDialog onClose={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: '修改 API Key' }));
    const input = screen.getByLabelText('新的 DeepSeek API Key');
    expect(input).toHaveValue('');
    fireEvent.change(input, { target: { value: 'temporary-draft-key' } });
    fireEvent.click(screen.getByRole('button', { name: '取消修改' }));
    expect(screen.queryByLabelText('新的 DeepSeek API Key')).not.toBeInTheDocument();
    expect(request.mock.calls.every(([, init]) => !init?.method || init.method === 'GET')).toBe(true);
  });
  it('解析与复制保留合法得分，拒绝伪造类型和空建议', () => {
    expect(validResult(record.result)).toBe(true);
    expect(validResult({ ...record.result, score: 101 })).toBe(false);
    expect(validResult({ ...record.result, suggestions: [] })).toBe(false);
    expect(validResult({ ...record.result, score: '72' })).toBe(false);
    expect(formatAICopy(record)).toContain('72/100');
    expect(formatAICopy(record)).toContain('原问题');
  });
});
