import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AnkiDeckDetail } from './AnkiDeckDetail';
import { AnkiBrowse } from './AnkiBrowse';
import { AnkiReview } from './AnkiReview';
import { AnkiDialogs } from './AnkiDialogs';
import { fetchDeckCards } from './anki-api';
import type { AnkiCard, NormalizedDashboard } from './anki-api';
import { matchesTag, parseTags } from './anki-tags';

const cards: AnkiCard[] = ['GMP', 'GC', '基础语法', 'slice', ''].map((tag, index) => ({
  id: `c${index}`,
  deckId: 'd1',
  question: `问题${index}`,
  answer: '==答案重点==',
  tags: tag ? [tag] : [],
  dueAt: '2026-10-27T00:00:00Z',
  intervalDays: 0,
  repetitions: 0,
  easeFactor: 2.5,
  reviewCount: 0,
  version: 1,
}));
const dashboard: NormalizedDashboard = {
  categories: [{ id: 'cat', name: '语言' }],
  decks: [{ id: 'd1', categoryId: 'cat', name: 'Golang', total: 5, learned: 0, stable: 0, due: 5 }],
  today: 0,
  todayCards: 0,
  history: [],
  timeZone: 'Asia/Shanghai',
  goal: 12,
};
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const catalog = ['GMP', 'GC', '基础语法', 'slice'].map((name, i) => ({ id: `t${i}`, name, cardCount: 1 }));
const stubCards = () => {
  const fetcher = vi
    .fn()
    .mockImplementation(
      async (url) =>
        new Response(JSON.stringify(String(url).endsWith('/tags') ? { tags: catalog } : { cards, previews: {} })),
    );
  vi.stubGlobal('fetch', fetcher);
  return fetcher;
};

describe('卡片库内标签', () => {
  it('逗号/中文逗号分隔、去重且保留基础语法标签；旧卡片按无标签处理', () => {
    expect(parseTags(' GMP, gmp，GC,基础语法\nslice')).toEqual(['GMP', 'GC', '基础语法', 'slice']);
    expect(matchesTag(cards[0], 'gmp')).toBe(true);
    expect(matchesTag(cards[0], 'GC')).toBe(false);
    expect(matchesTag({ tags: undefined }, '')).toBe(true);
  });
  it('响应的标签被归一化，旧响应及非法字段安全降级为无标签', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            cards: [cards[0], { ...cards[1], tags: null }, { ...cards[2], tags: [' GC ', 3, 'gc'] }],
          }),
        ),
      ),
    );
    const loaded = await fetchDeckCards('d1');
    expect(loaded.map((card) => card.tags)).toEqual([['GMP'], [], ['GC']]);
  });
  it('库内筛选、点击卡片标签、无标签和清除筛选不发写请求；隐藏答案', async () => {
    const fetcher = stubCards();
    const browse = vi.fn();
    const practice = vi.fn();
    render(
      <AnkiDeckDetail
        deck={dashboard.decks[0]}
        categoryName="语言"
        onBack={vi.fn()}
        onNewCard={vi.fn()}
        onEditCard={vi.fn()}
        onBrowse={browse}
        onPractice={practice}
      />,
    );
    await screen.findByText('问题0');
    fireEvent.click(screen.getByRole('button', { name: 'GC' }));
    expect(screen.getByText('问题1')).toBeInTheDocument();
    expect(screen.queryByText('问题0')).not.toBeInTheDocument();
    expect(screen.queryByText('答案重点')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '随机浏览' }));
    expect(browse).toHaveBeenCalledWith('GC');
    fireEvent.click(screen.getByRole('button', { name: '按标签练习' }));
    expect(practice).toHaveBeenCalledWith('GC');
    fireEvent.click(screen.getByRole('button', { name: '无标签' }));
    expect(screen.getByText('问题4')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '全部标签' }));
    expect(screen.getAllByText(/^问题\d$/)).toHaveLength(5);
    fireEvent.click(screen.getByRole('button', { name: '筛选标签 slice' }));
    expect(screen.getAllByText(/^问题\d$/)).toHaveLength(1);
    expect(screen.getByText('问题3')).toBeInTheDocument();
    expect(fetcher.mock.calls.every(([, init]) => !init?.method || init.method === 'GET')).toBe(true);
  });
  it.each(['browse', 'review'] as const)('%s 仅加载选中标签；卡片显示标签且未揭示答案', async (view) => {
    stubCards();
    render(
      view === 'browse' ? (
        <AnkiBrowse deckId="d1" deckName="Golang" tag="GMP" onExit={vi.fn()} />
      ) : (
        <AnkiReview decks={dashboard.decks} deckId="d1" tag="GMP" onExit={vi.fn()} onSessionSettled={vi.fn()} />
      ),
    );
    await screen.findByText('问题0');
    expect(screen.queryByText('问题1')).not.toBeInTheDocument();
    expect(within(screen.getByRole('group', { name: '卡片标签' })).getByText('GMP')).toBeInTheDocument();
    expect(screen.queryByText('答案重点')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '显示答案' }));
    expect(screen.getByText('答案重点').tagName).toBe('MARK');
  });
  it.each([false, true])('编辑=%s 标签保存到同一卡片库并保留排期', async (editing) => {
    const fetcher = vi
      .fn()
      .mockImplementation(
        async (url) => new Response(JSON.stringify(String(url).endsWith('/tags') ? { tags: catalog } : cards[0])),
      );
    vi.stubGlobal('fetch', fetcher);
    const done = vi.fn();
    render(
      <AnkiDialogs
        state={{ kind: 'card', ...(editing ? { card: cards[0] } : { deckId: 'd1' }) }}
        dashboard={dashboard}
        onClose={vi.fn()}
        onDone={done}
      />,
    );
    const choices = await screen.findByRole('group', { name: '选择已有标签' });
    expect(screen.queryByRole('textbox', { name: '卡片标签' })).not.toBeInTheDocument();
    if (editing) expect(within(choices).getByRole('button', { name: 'GMP' })).toHaveAttribute('aria-pressed', 'true');
    else {
      fireEvent.change(screen.getByLabelText('Q · 问题'), { target: { value: 'q' } });
      fireEvent.change(screen.getByLabelText('A · 答案'), { target: { value: '==a==' } });
      fireEvent.click(within(choices).getByRole('button', { name: 'GMP' }));
    }
    fireEvent.click(within(choices).getByRole('button', { name: 'GC' }));
    fireEvent.click(within(choices).getByRole('button', { name: '基础语法' }));
    fireEvent.click(screen.getByRole('button', { name: '保存卡片' }));
    await waitFor(() => expect(done).toHaveBeenCalled());
    const writes = fetcher.mock.calls.filter(([, init]) => init?.method);
    const body = JSON.parse(writes[0][1].body);
    expect(body.tags).toEqual(['GMP', 'GC', '基础语法']);
    if (editing) expect(body).toMatchObject({ resetProgress: false, version: 1, deckId: 'd1' });
    expect(writes).toHaveLength(1);
  });
  it('标签目录失败保留草稿并阻止保存，不暗中创建标签', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('error', { status: 503 }));
    vi.stubGlobal('fetch', fetcher);
    render(
      <AnkiDialogs state={{ kind: 'card', card: cards[0] }} dashboard={dashboard} onClose={vi.fn()} onDone={vi.fn()} />,
    );
    await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('button', { name: '保存卡片' }));
    expect(screen.getByLabelText('Q · 问题')).toHaveValue('问题0');
    expect(fetcher.mock.calls.filter(([, init]) => init?.method)).toHaveLength(0);
  });
});
