import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AnkiBrowse } from './AnkiBrowse';
import { AnkiReview } from './AnkiReview';
import { prioritizeCards } from './anki-priority';
import type { AnkiCard } from './anki-api';

const cards: AnkiCard[] = [0, 1, 2].map((index) => ({
  id: `card-${index}`,
  deckId: 'deck',
  question: `问题${index}`,
  answer: `答案${index}`,
  tags: ['基础'],
  dueAt: '2099-01-01T00:00:00Z',
  intervalDays: 10,
  repetitions: 1,
  easeFactor: 2.5,
  reviewCount: 1,
  version: 1,
  practiceCount: 1,
  correctCount: 1,
  hardCount: 0,
  wrongCount: 0,
  customCount: 0,
}));
const json = (data: unknown) => new Response(JSON.stringify(data));
const deck = { id: 'deck', name: '学习库', categoryId: 'category', total: 3, due: 0, learned: 3, stable: 0 };
const setup = (loaded = cards) => {
  vi.spyOn(Math, 'random').mockReturnValue(0.999);
  const fetcher = vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
    const url = String(input);
    if (url.endsWith('/queue')) return json({ cards: [], serverNow: '2026-11-03T00:00:00Z' });
    if (url.endsWith('/cards')) return json({ cards: loaded });
    if (url.endsWith('/practice')) {
      const payload = JSON.parse(String(init?.body));
      const card = loaded.find((item) => item.id === payload.cardId)!;
      return json({ card: { ...card, version: card.version + 1, practiceCount: 2 } });
    }
    return new Response('not found', { status: 404 });
  });
  vi.stubGlobal('fetch', fetcher);
  return fetcher;
};
const writes = (fetcher: ReturnType<typeof setup>) => fetcher.mock.calls.filter(([, init]) => init?.method === 'POST');
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('随机浏览复用今日练习', () => {
  it('全部未到期卡可看，上一张/下一张隐藏答案，页面阅读面没有嵌套滚动或写入', async () => {
    const fetcher = setup();
    const { container } = render(<AnkiBrowse deckId="deck" deckName="学习库" onExit={vi.fn()} />);
    await screen.findByText('问题0');
    expect(screen.getByRole('article', { name: '当前卡牌' })).toHaveClass('bg-white', 'p-6');
    expect(container.querySelector('.anki-browse-stage')).toBeNull();
    expect(screen.getByRole('button', { name: '上一张' })).toBeDisabled();
    expect(screen.queryByRole('group', { name: '评价这次回忆' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '显示答案' }));
    expect(screen.getByText('答案0')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: '评价这次回忆' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '下一张' }));
    expect(screen.getByText('问题1')).toBeInTheDocument();
    expect(screen.queryByText('答案0')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '下一张' }));
    expect(screen.getByText('问题2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '下一张' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '上一张' }));
    expect(screen.getByText('问题1')).toBeInTheDocument();
    expect(writes(fetcher)).toHaveLength(0);
  });

  it.each(['正确', '模糊', '错误'] as const)('%s 使用主动练习接口并携带版本，成功才推进', async (label) => {
    const fetcher = setup();
    render(<AnkiBrowse deckId="deck" deckName="学习库" onExit={vi.fn()} />);
    await screen.findByText('问题0');
    fireEvent.click(screen.getByRole('button', { name: '显示答案' }));
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${label}`) }));
    await screen.findByText('问题1');
    expect(screen.queryByText('答案0')).not.toBeInTheDocument();
    const [url, init] = writes(fetcher)[0];
    expect(String(url)).toMatch(/\/anki\/practice$/);
    expect(JSON.parse(String(init?.body))).toMatchObject({
      cardId: 'card-0',
      version: 1,
      rating: { 正确: 'correct', 模糊: 'hard', 错误: 'wrong' }[label],
    });
    expect(screen.queryByLabelText('自定义复习天数')).not.toBeInTheDocument();
  });

  it('失败留在原卡并禁止换评分/切卡/重开，重试复用完全相同请求', async () => {
    const fetcher = setup();
    const original = fetcher.getMockImplementation()!;
    let failure = true;
    fetcher.mockImplementation(async (input, init) => {
      if (String(input).endsWith('/practice') && failure) {
        failure = false;
        return new Response('fail', { status: 503 });
      }
      return original(input, init);
    });
    render(<AnkiBrowse deckId="deck" deckName="学习库" onExit={vi.fn()} />);
    await screen.findByText('问题0');
    fireEvent.click(screen.getByRole('button', { name: '显示答案' }));
    fireEvent.click(screen.getByRole('button', { name: /^正确/ }));
    await screen.findByRole('alert');
    expect(screen.getByText('问题0')).toBeInTheDocument();
    expect(screen.getByText('答案0')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^错误/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: '下一张' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '重新洗牌' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '重试' }));
    await screen.findByText('问题1');
    expect(writes(fetcher)).toHaveLength(2);
    expect(writes(fetcher)[0][1]?.body).toBe(writes(fetcher)[1][1]?.body);
  });

  it('提交中双击只提交一次、不能切卡/重开，卸载取消并拒绝晚到结果', async () => {
    const fetcher = setup();
    const original = fetcher.getMockImplementation()!;
    let release: ((response: Response) => void) | undefined;
    fetcher.mockImplementation((input, init) =>
      String(input).endsWith('/practice')
        ? new Promise<Response>((resolve) => {
            release = resolve;
          })
        : original(input, init),
    );
    const settled = vi.fn();
    const rendered = render(<AnkiBrowse deckId="deck" deckName="学习库" onExit={vi.fn()} onSessionSettled={settled} />);
    await screen.findByText('问题0');
    fireEvent.click(screen.getByRole('button', { name: '显示答案' }));
    const correct = screen.getByRole('button', { name: /^正确/ });
    fireEvent.click(correct);
    fireEvent.click(correct);
    expect(writes(fetcher)).toHaveLength(1);
    expect(screen.getByRole('button', { name: '下一张' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '重新洗牌' })).toBeDisabled();
    rendered.unmount();
    expect(writes(fetcher)[0][1]?.signal?.aborted).toBe(true);
    await act(async () => release?.(json({ card: cards[0] })));
    expect(settled).not.toHaveBeenCalled();
  });

  it('单卡重洗重新拉取最新版本、归首卡、隐藏答案，最后评价更新统计且可再次开始', async () => {
    const fetcher = setup(cards.slice(0, 1));
    const settled = vi.fn();
    render(<AnkiBrowse deckId="deck" deckName="学习库" onExit={vi.fn()} onSessionSettled={settled} />);
    await screen.findByText('问题0');
    fireEvent.click(screen.getByRole('button', { name: '显示答案' }));
    fireEvent.click(screen.getByRole('button', { name: '重新洗牌' }));
    await screen.findByText('问题0');
    expect(screen.queryByText('答案0')).not.toBeInTheDocument();
    expect(fetcher.mock.calls.filter(([input]) => String(input).endsWith('/cards'))).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: '显示答案' }));
    fireEvent.click(screen.getByRole('button', { name: /^正确/ }));
    await screen.findByText('本轮练习完成');
    expect(settled).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: '重新洗牌' }));
    await screen.findByText('问题0');
  });
});

describe('今日练习手动全量', () => {
  it('全量读取全部失败可重载，不伪装完成', async () => {
    const fetcher = setup();
    const original = fetcher.getMockImplementation()!;
    render(<AnkiReview decks={[deck]} deckId={null} onExit={vi.fn()} onSessionSettled={vi.fn()} />);
    await screen.findByText('暂无到期卡片');
    fetcher.mockResolvedValue(new Response('error', { status: 503 }));
    fireEvent.click(screen.getByRole('button', { name: '手动全量练习' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('全量卡片加载失败');
    expect(screen.queryByText('本轮练习完成')).not.toBeInTheDocument();
    fetcher.mockImplementation(original);
    fireEvent.click(screen.getByRole('button', { name: '重新加载队列' }));
    await screen.findByText('问题0');
  });
  it('空库的手动入口禁用，缺失服务端时钟明确警告且仍覆盖全部卡片', async () => {
    const fetcher = setup();
    const rendered = render(<AnkiReview decks={[]} deckId={null} onExit={vi.fn()} onSessionSettled={vi.fn()} />);
    await screen.findByText('暂无到期卡片');
    expect(screen.getByRole('button', { name: '手动全量练习' })).toBeDisabled();
    rendered.unmount();
    const original = fetcher.getMockImplementation()!;
    fetcher.mockImplementation((input, init) =>
      String(input).endsWith('/queue') ? Promise.resolve(json({ cards: [] })) : original(input, init),
    );
    render(<AnkiBrowse deckId="deck" deckName="学习库" onExit={vi.fn()} />);
    await screen.findByText('问题0');
    expect(screen.getByRole('alert')).toHaveTextContent('服务端时间暂不可用');
    expect(screen.getByText(/随机浏览 · 1 \/ 3/)).toBeInTheDocument();
  });
  it('无到期也能发起所有非空库的全量练习，不沿用单库标签，完成可重开', async () => {
    const fetcher = setup();
    render(
      <AnkiReview
        decks={[deck, { ...deck, id: 'second', total: 1 }, { ...deck, id: 'empty', total: 0 }]}
        deckId="deck"
        tag="不存在"
        onExit={vi.fn()}
        onSessionSettled={vi.fn()}
      />,
    );
    await screen.findByText('暂无到期卡片');
    fireEvent.click(screen.getByRole('button', { name: '手动全量练习' }));
    await screen.findByText('问题0');
    expect(fetcher.mock.calls.some(([input]) => String(input).includes('/second/cards'))).toBe(true);
    expect(fetcher.mock.calls.some(([input]) => String(input).includes('/empty/'))).toBe(false);
    expect(screen.getByText(/第 1 \/ 3 张/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '显示答案' }));
    fireEvent.click(screen.getByRole('button', { name: /^正确/ }));
    await screen.findByText('问题1');
    expect(String(writes(fetcher)[0][0])).toMatch(/\/practice$/);
    fireEvent.click(screen.getByRole('button', { name: '手动全量练习' }));
    await screen.findByText('问题0');
    expect(screen.queryByText('答案0')).not.toBeInTheDocument();
  });
  it('全量任一库读取失败不伪装全量成功，部分警告持续到结束，失败可重新加载', async () => {
    const fetcher = setup(cards.slice(0, 1));
    const original = fetcher.getMockImplementation()!;
    fetcher.mockImplementation((input, init) =>
      String(input).includes('/second/')
        ? Promise.resolve(new Response('error', { status: 503 }))
        : original(input, init),
    );
    render(
      <AnkiReview
        decks={[deck, { ...deck, id: 'second' }]}
        deckId={null}
        onExit={vi.fn()}
        onSessionSettled={vi.fn()}
      />,
    );
    await screen.findByText('暂无到期卡片');
    fireEvent.click(screen.getByRole('button', { name: '手动全量练习' }));
    await screen.findByText('问题0');
    expect(screen.getByRole('alert')).toHaveTextContent('部分卡片库队列加载失败');
    fireEvent.click(screen.getByRole('button', { name: '显示答案' }));
    fireEvent.click(screen.getByRole('button', { name: /^正确/ }));
    await screen.findByText('已加载卡片练习完成');
    expect(screen.getByRole('alert')).toHaveTextContent('未加载的部分');
  });
});

describe('排期遗忘优先级', () => {
  it('已学到期相对逾期优先，新卡其次、未到期最后，去重并不修改输入', () => {
    const now = '2026-11-03T00:00:00Z';
    const moderate = { ...cards[0], id: 'moderate', dueAt: '2026-10-24T00:00:00Z', intervalDays: 100 };
    const urgent = { ...cards[0], id: 'urgent', dueAt: '2026-11-01T00:00:00Z', intervalDays: 1 };
    const fresh = { ...cards[0], id: 'fresh', reviewCount: 0 };
    const input = [cards[0], fresh, moderate, urgent, urgent];
    expect(prioritizeCards(input, new Set(['moderate', 'urgent']), now).map((card) => card.id)).toEqual([
      'urgent',
      'moderate',
      'fresh',
      'card-0',
    ]);
    expect(input).toHaveLength(5);
    expect(moderate.intervalDays).toBe(100);
  });
  it('同优先级随机而非固化顺序，非法时间退为服务端到期集合/dueAt，不使用本机时钟', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    expect(prioritizeCards(cards, new Set(), '').map((card) => card.id)).not.toEqual(cards.map((card) => card.id));
    const earlier = { ...cards[0], id: 'earlier', dueAt: '2026-10-01T00:00:00Z' };
    expect(prioritizeCards([cards[0], earlier], new Set(['earlier']), '').map((card) => card.id)).toEqual([
      'earlier',
      'card-0',
    ]);
  });
  it('实际跨库加载按服务端到期集合推荐，未来卡完整覆盖', async () => {
    const fetcher = setup();
    const urgent = { ...cards[2], dueAt: '2026-11-01T00:00:00Z', intervalDays: 1 };
    const original = fetcher.getMockImplementation()!;
    fetcher.mockImplementation((input, init) =>
      String(input).endsWith('/queue')
        ? Promise.resolve(json({ cards: [urgent], serverNow: '2026-11-03T00:00:00Z' }))
        : String(input).endsWith('/cards')
          ? Promise.resolve(json({ cards: [cards[0], cards[1], urgent] }))
          : original(input, init),
    );
    render(<AnkiBrowse deckId="deck" deckName="学习库" onExit={vi.fn()} />);
    await screen.findByText('问题2');
    expect(screen.getByText(/随机浏览 · 1 \/ 3/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '下一张' }));
    await waitFor(() => expect(screen.queryByText('问题2')).not.toBeInTheDocument());
  });
});
