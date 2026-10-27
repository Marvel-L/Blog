import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AnkiDeckDetail } from './AnkiDeckDetail';
import { AnkiPracticeActions } from './AnkiPracticeActions';
import { AnkiCardCounts } from './AnkiCardCounts';
import type { AnkiCard } from './anki-api';

const card: AnkiCard = {
  id: 'card1',
  deckId: 'deck1',
  question: '主动练习问题',
  answer: '**答案**',
  dueAt: '2030-01-01T00:00:00Z',
  intervalDays: 6,
  repetitions: 2,
  easeFactor: 2.5,
  reviewCount: 2,
  version: 3,
  practiceCount: 4,
  correctCount: 2,
  hardCount: 1,
  wrongCount: 1,
  customCount: 0,
};
const deck = { id: 'deck1', categoryId: 'cat1', name: '测试库', total: 1, learned: 1, stable: 0, due: 0 };
const response = (data: unknown) => new Response(JSON.stringify(data), { status: 200 });
const mount = (onRecorded = vi.fn()) =>
  render(
    <AnkiDeckDetail
      deck={deck}
      categoryName="测试"
      onBack={vi.fn()}
      onNewCard={vi.fn()}
      onEditCard={vi.fn()}
      onBrowse={vi.fn()}
      onPractice={vi.fn()}
      onRecorded={onRecorded}
    />,
  );
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('库内主动练习', () => {
  it.each([
    ['熟悉', 'correct', 'correctCount'],
    ['模糊', 'hard', 'hardCount'],
    ['忘记', 'wrong', 'wrongCount'],
  ] as const)('%s：主动揭示后才可评价未来卡，成功更新次数并收起答案', async (label, rating, countKey) => {
    const updated = { ...card, version: 4, reviewCount: 3, practiceCount: 5, [countKey]: card[countKey]! + 1 };
    const request = vi
      .fn<typeof fetch>()
      .mockImplementation(async (input) =>
        String(input).endsWith('/tags')
          ? response({ tags: [] })
          : String(input).endsWith('/practice')
            ? response({ card: updated })
            : response({ cards: [card] }),
      );
    vi.stubGlobal('fetch', request);
    const refresh = vi.fn();
    mount(refresh);
    await screen.findByText('主动练习问题');
    expect(screen.queryByRole('group', { name: '评价这张卡片的回忆' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('卡片练习统计')).toHaveTextContent('练习 4 次');
    fireEvent.click(screen.getByRole('button', { name: '查看答案' }));
    expect(request.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: label }));
    await screen.findByText('练习已记录，下次复习安排和结果次数已更新。');
    expect(screen.getByLabelText('卡片练习统计')).toHaveTextContent('练习 5 次');
    expect(screen.queryByRole('region', { name: '卡片答案' })).not.toBeInTheDocument();
    expect(refresh).toHaveBeenCalledTimes(1);
    const post = request.mock.calls.find(([url]) => String(url).endsWith('/practice'))!;
    expect(JSON.parse(String(post[1]?.body))).toMatchObject({ cardId: 'card1', version: 3, rating });
    expect(post[1]).toMatchObject({ credentials: 'same-origin', cache: 'no-store' });
  });

  it('失败保持答案/旧计数，重试复用 mutationId，只在成功后更新', async () => {
    let attempts = 0;
    const updated = { ...card, version: 4, practiceCount: 5, correctCount: 3 };
    const request = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      if (String(input).endsWith('/tags')) return response({ tags: [] });
      if (!String(input).endsWith('/practice')) return response({ cards: [card] });
      return ++attempts === 1 ? new Response('offline', { status: 503 }) : response({ card: updated });
    });
    vi.stubGlobal('fetch', request);
    mount();
    fireEvent.click(await screen.findByRole('button', { name: '查看答案' }));
    fireEvent.click(screen.getByRole('button', { name: '熟悉' }));
    await screen.findByRole('alert');
    expect(screen.getByRole('region', { name: '卡片答案' })).toBeInTheDocument();
    expect(screen.getByLabelText('卡片练习统计')).toHaveTextContent('练习 4 次');
    expect(screen.getByRole('button', { name: '模糊' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '重试记录' }));
    await screen.findByText('练习已记录，下次复习安排和结果次数已更新。');
    const posts = request.mock.calls.filter(([url]) => String(url).endsWith('/practice'));
    expect(posts).toHaveLength(2);
    expect(posts[0][1]?.body).toBe(posts[1][1]?.body);
  });

  it('双击只发一次请求，卸载取消在途请求，晚到响应不回调', async () => {
    let release: ((response: Response) => void) | undefined;
    const request = vi.fn<typeof fetch>().mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          release = resolve;
        }),
    );
    vi.stubGlobal('fetch', request);
    const done = vi.fn();
    const mounted = render(<AnkiPracticeActions card={card} onRecorded={done} />);
    fireEvent.click(screen.getByRole('button', { name: '熟悉' }));
    fireEvent.click(screen.getByRole('button', { name: '熟悉' }));
    expect(request).toHaveBeenCalledTimes(1);
    mounted.unmount();
    expect(request.mock.calls[0][1]?.signal?.aborted).toBe(true);
    await act(async () => {
      release?.(response({ card: { ...card, version: 4 } }));
    });
    expect(done).not.toHaveBeenCalled();
  });

  it('版本冲突不能显示成功或虚增次数，保留服务端错误', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn<typeof fetch>()
        .mockImplementation(async (url) =>
          String(url).endsWith('/tags')
            ? response({ tags: [] })
            : String(url).endsWith('/practice')
              ? new Response('{}', { status: 409 })
              : response({ cards: [card] }),
        ),
    );
    mount();
    fireEvent.click(await screen.findByRole('button', { name: '查看答案' }));
    fireEvent.click(screen.getByRole('button', { name: '忘记' }));
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.queryByText('练习已记录，下次复习安排和结果次数已更新。')).not.toBeInTheDocument();
    expect(screen.getByLabelText('卡片练习统计')).toHaveTextContent('练习 4 次');
  });
});

describe('卡片计数兼容', () => {
  it('老服务缺少结果次数时明确不可用，不伪造为 0', () => {
    render(<AnkiCardCounts card={{ ...card, practiceCount: undefined }} />);
    expect(screen.getByText(/终身结果统计暂不可用/)).toHaveTextContent('当前学习周期已练 2 次');
    expect(screen.queryByText('熟悉 0 次')).not.toBeInTheDocument();
  });
});
