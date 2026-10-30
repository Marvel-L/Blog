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
const fixture = (options: { configured?: boolean; failure?: boolean; check?: AICheck } = {}) => {
  const check = options.check ?? record;
  let list = [check];
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
      return response({ check: { ...check, id: 'new-check' } }, 202);
    }
    if (init?.method === 'DELETE') {
      list = [];
      return new Response(null, { status: 204 });
    }
    if (url.includes('?limit=')) return response({ checks: list, nextCursor: '' });
    return response({ check });
  });
  vi.stubGlobal('fetch', request);
  return request;
};
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
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
  it.each(['review', 'history'] as const)('%s 评价渲染重点、换行和列表，复制保留 Markdown 源码', async (view) => {
    const check: AICheck = {
      ...record,
      result: {
        score: 72,
        summary: '结论：==覆盖常见场景==；关键判断：聚合函数本身不会导致索引失效',
        strengths: ['正确点：==基于成本选择索引==；理由：优化器比较访问路径的成本'],
        issues: [
          '原文：使用聚合函数\n问题：【错误】聚合函数本身不会导致索引失效\n修正：==对索引列使用函数== 可能影响索引定位',
        ],
        suggestions: [
          '修正版回答：\n1. 检查 ==最左前缀==。\n2. 检查执行计划。\n\n```sql\nSELECT * FROM t WHERE status = 1;\n-- ==代码不高亮==\n```',
          '改进建议：用 `a == b` 这样的代码表达式区分运算符与重点标记。',
        ],
      },
    };
    const request = fixture({ check });
    const copy = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText: copy } });
    const { container } = render(<AnkiAIDialog card={card} onClose={vi.fn()} />);
    const start = await screen.findByRole('button', { name: '开始 Check' });
    await waitFor(() => expect(start).toBeEnabled());
    fireEvent.click(view === 'history' ? screen.getByRole('button', { name: '查看 AI 历史' }) : start);
    await screen.findByText('覆盖常见场景', { selector: 'mark' });
    expect(container.querySelector('.anki-ai-result-head mark')).toHaveTextContent('覆盖常见场景');
    for (const [heading, highlight] of [
      ['回答优点', '基于成本选择索引'],
      ['存在的问题', '对索引列使用函数'],
      ['明确建议', '最左前缀'],
    ]) {
      const section = screen.getByRole('heading', { name: heading }).closest('section')!;
      expect(within(section).getByText(highlight, { selector: 'mark' })).toBeInTheDocument();
    }
    const issues = screen.getByRole('heading', { name: '存在的问题' }).closest('section')!;
    expect(issues.querySelectorAll('br')).toHaveLength(2);
    const suggestions = screen.getByRole('heading', { name: '明确建议' }).closest('section')!;
    expect(suggestions.querySelectorAll('ol > li')).toHaveLength(2);
    expect(suggestions.querySelector('pre code')).toHaveTextContent('-- ==代码不高亮==');
    expect(suggestions.querySelector('code mark')).toBeNull();
    expect(within(suggestions).getByText('a == b', { selector: 'code' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '复制本轮问答' }));
    await waitFor(() => expect(copy).toHaveBeenCalledTimes(1));
    expect(copy.mock.calls[0][0]).toContain('==最左前缀==');
    expect(copy.mock.calls[0][0]).toContain('原文：使用聚合函数\n问题：【错误】');
    expect(request.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(view === 'history' ? 0 : 1);
  });
  it('AI 历史中的高亮内容不执行 HTML、危险链接或加载远程图片', async () => {
    fixture({
      check: {
        ...record,
        result: {
          ...record.result!,
          summary: '==安全评价== <img src=x onerror=alert(1)>',
          strengths: ['==[危险链接](javascript:alert%281%29)=='],
          issues: ['<script>alert(1)</script>\n\n==纠正内容=='],
          suggestions: ['![远程图片](https://example.com/tracker.png)\n\n==保留重点=='],
        },
      },
    });
    const { container } = render(<AnkiAIDialog card={card} onClose={vi.fn()} />);
    await screen.findByRole('button', { name: '开始 Check' });
    fireEvent.click(screen.getByRole('button', { name: '查看 AI 历史' }));
    await screen.findByText('安全评价', { selector: 'mark' });
    const detail = container.querySelector('.anki-ai-detail')!;
    expect(detail.querySelector('script,img,iframe,a,[onerror],[onclick]')).toBeNull();
    expect(within(detail as HTMLElement).getByText('危险链接', { selector: 'mark span' })).toBeInTheDocument();
    expect(within(detail as HTMLElement).getByText('纠正内容', { selector: 'mark' })).toBeInTheDocument();
    expect(within(detail as HTMLElement).getByText('保留重点', { selector: 'mark' })).toBeInTheDocument();
    expect(within(detail as HTMLElement).getByText('[图片：远程图片]')).toBeInTheDocument();
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
  it.each(['running', 'unknown'] as const)(
    '刷新状态后同步详情并恢复 %s 任务的查询，不重发评分',
    async (refreshStatus) => {
      vi.useFakeTimers();
      const running: AICheck = { ...record, id: 'new-check', status: 'running', score: null, result: undefined };
      const terminal: AICheck = { ...running, status: 'unknown', errorCode: 'AI_TIMEOUT' };
      let created = false;
      let refreshing = false;
      let failDetail = true;
      let detailReads = 0;
      const request = vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
        const url = String(input);
        if (url.endsWith('/ai/settings'))
          return response({ configured: true, available: true, maskedKey: '••••test', updatedAt: null });
        if (init?.method === 'POST') {
          created = true;
          return response({ check: running }, 202);
        }
        if (url.includes('?limit=')) {
          const current = refreshing && refreshStatus === 'unknown' ? terminal : running;
          return response({
            checks: created ? [current] : [],
            nextCursor: '',
            active: created && current.status === 'running' ? current : undefined,
          });
        }
        detailReads++;
        if (failDetail) {
          failDetail = false;
          throw new TypeError('查询中断');
        }
        return response({ check: refreshStatus === 'running' && detailReads === 2 ? running : terminal });
      });
      vi.stubGlobal('fetch', request);
      await act(async () => {
        render(<AnkiAIDialog card={card} onClose={vi.fn()} />);
      });
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: '开始 Check' }));
      });
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: '查看 AI 历史' }));
      });
      expect(screen.getByRole('alert')).toHaveTextContent('查询中断');
      refreshing = true;
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: '刷新状态' }));
      });
      if (refreshStatus === 'running') {
        expect(screen.getByText(/正在检查…关闭窗口/)).toBeInTheDocument();
        await act(async () => {
          await vi.advanceTimersByTimeAsync(2000);
        });
      }
      expect(screen.getByText('调用超时，是否已产生费用无法确定；没有自动重发。')).toBeInTheDocument();
      expect(screen.queryByText(/正在检查…关闭窗口/)).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: '返回 Ai Check' }));
      expect(screen.getByRole('button', { name: '开始 Check' })).toBeEnabled();
      expect(request.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1);
      const reads = detailReads;
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10000);
      });
      expect(detailReads).toBe(reads);
    },
  );
  it('状态查询恢复后清除过期的重新查询提示，终态停止轮询', async () => {
    vi.useFakeTimers();
    const running: AICheck = { ...record, id: 'new-check', status: 'running', score: null, result: undefined };
    const request = fixture({ check: running });
    const original = request.getMockImplementation()!;
    let polls = 0;
    request.mockImplementation(async (url, init) => {
      if (String(url).endsWith('/ai-checks/new-check') && !init?.method) {
        if (++polls === 1) throw new TypeError('network');
        return response({ check: { ...record, id: 'new-check' } });
      }
      return original(url, init);
    });
    await act(async () => {
      render(<AnkiAIDialog card={card} onClose={vi.fn()} />);
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '开始 Check' }));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(screen.getByText('任务状态暂时无法获取，正在重新查询；不会再次调用 AI。')).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000);
    });
    expect(screen.getByText('正确但不完整')).toBeInTheDocument();
    expect(screen.queryByText(/任务状态暂时无法获取/)).not.toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000);
    });
    expect(polls).toBe(2);
    expect(request.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1);
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
