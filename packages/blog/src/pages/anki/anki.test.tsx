/**
 * Anki 行为测试（真实组件渲染，fetch 按 URL 路由桩）。
 *
 * 覆盖：登录门、库列表进度、揭示后才自评、评价成功推进/失败留当前卡、
 * mutationId 重试幂等、随机浏览无写入、账号切换清理、热力/折线渲染。
 */
import { StrictMode } from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { HelmetProvider } from 'react-helmet-async';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AnkiPage from './Anki';
import { AnkiReview } from './AnkiReview';
import { AnkiDialogs } from './AnkiDialogs';

const DASHBOARD = {
  categories: [{ id: 'c1', name: '编程' }],
  decks: [{ id: 'd1', categoryId: 'c1', name: 'Go 语言', total: 4, learned: 2, stable: 1, due: 2 }],
  goal: 12,
  today: 1,
  timeZone: 'Asia/Shanghai',
  history: [
    { date: '2026-10-20', uniqueCards: 2, reviews: 3, goal: 12 },
    { date: '2026-10-21', uniqueCards: 4, reviews: 6, goal: 12 },
    { date: '2026-10-22', uniqueCards: 1, reviews: 2, goal: 12 },
    { date: '2026-10-23', uniqueCards: 0, reviews: 0, goal: 12 },
    { date: '2026-10-24', uniqueCards: 3, reviews: 4, goal: 12 },
    { date: '2026-10-25', uniqueCards: 2, reviews: 2, goal: 12 },
    { date: '2026-10-26', uniqueCards: 1, reviews: 2, goal: 12 },
  ],
};

const makeCard = (id: string, question: string, version = 1) => ({
  id,
  deckId: 'd1',
  question,
  answer: `${question} 的答案`,
  dueAt: '2026-10-27T10:00:00Z',
  intervalDays: 3,
  repetitions: 1,
  easeFactor: 2.5,
  reviewCount: 1,
  version,
});

let request: ReturnType<typeof vi.fn<typeof fetch>>;
let reviewFailure: 'none' | 'once' | 'always' = 'none';

const pendingReviews = () =>
  request.mock.calls.filter(([url, init]) => String(url).includes('/anki/reviews') && init?.method === 'POST');

beforeEach(() => {
  reviewFailure = 'none';
  request = vi.fn<typeof fetch>().mockImplementation(async (input) => {
    const url = String(input);
    if (url.endsWith('/anki/dashboard')) return new Response(JSON.stringify(DASHBOARD), { status: 200 });
    if (url.endsWith('/anki/decks/d1/queue'))
      return new Response(
        JSON.stringify({ cards: [makeCard('card1', 'Q1?'), makeCard('card2', 'Q2?')], serverNow: '' }),
      );
    if (url.endsWith('/anki/decks/d1/cards'))
      return new Response(JSON.stringify({ cards: [makeCard('card1', 'Q1?'), makeCard('card2', 'Q2?')] }), {
        status: 200,
      });
    if (url.endsWith('/anki/reviews')) {
      if (reviewFailure === 'always' || reviewFailure === 'once') {
        reviewFailure = reviewFailure === 'always' ? 'always' : 'none';
        return new Response('boom', { status: 500 });
      }
      return new Response(JSON.stringify({ card: makeCard('card1', 'Q1?', 2) }), { status: 200 });
    }
    return new Response('not found', { status: 404 });
  });
  vi.stubGlobal('fetch', request);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const mount = () =>
  render(
    <StrictMode>
      <HelmetProvider>
        <MemoryRouter>
          <AnkiPage />
        </MemoryRouter>
      </HelmetProvider>
    </StrictMode>,
  );

describe('Anki 登录门与加载', () => {
  it('dashboard 401 时展示登录门与 GitHub 登录入口', async () => {
    request.mockImplementation(async (input) => {
      if (String(input).endsWith('/anki/dashboard')) return new Response('unauthorized', { status: 401 });
      return new Response('err', { status: 500 });
    });
    mount();
    expect(await screen.findByText('登录后，查看自己的卡片库')).toBeInTheDocument();
    const login = screen.getByRole('link', { name: /使用 GitHub 登录/ });
    expect(login).toHaveAttribute('href', '/api/v1/auth/github/start?return_to=%2Fanki');
  });

  it('dashboard 网络失败时如实展示错误与重试', async () => {
    request.mockRejectedValue(new Error('offline'));
    mount();
    expect(await screen.findByText(/学习统计暂时加载失败/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /重新加载/ }));
    // 重试后仍离线：仍停留在错误态，不假装成功。
    expect(await screen.findByText(/学习统计暂时加载失败/)).toBeInTheDocument();
  });

  it('展示库列表进度、今日目标与全局练习入口', async () => {
    mount();
    expect(await screen.findByText('我的卡片库')).toBeInTheDocument();
    expect(screen.getByText('Go 语言')).toBeInTheDocument();
    expect(screen.getByText('今日已练')).toBeInTheDocument();
    expect(screen.getByText(/今日目标/)).toHaveTextContent('1 / 12');
    expect(screen.getByRole('button', { name: /开始今日练习 · 2 张/ })).toBeEnabled();
  });

  it('返回博客与 logo 经 router basename 解析，dev=/ prod=/Blog', async () => {
    render(
      <StrictMode>
        <HelmetProvider>
          <MemoryRouter basename="/Blog" initialEntries={['/Blog/anki']}>
            <AnkiPage />
          </MemoryRouter>
        </HelmetProvider>
      </StrictMode>,
    );
    await screen.findByText('我的卡片库');
    expect(screen.getByRole('link', { name: /返回博客/ })).toHaveAttribute('href', '/Blog');
    expect(screen.getByRole('link', { name: /Anki/ })).toHaveAttribute('href', '/Blog');
  });
});

describe('到期练习：揭示后自评', () => {
  it('初始只显示 Q；揭示后才出现自评控件；成功评价推进到下一张并隐藏答案', async () => {
    mount();
    fireEvent.click(await screen.findByRole('button', { name: /开始今日练习 · 2 张/ }));
    expect(await screen.findByText('Q1?')).toBeInTheDocument();
    // 答案未揭示：不在 DOM 中
    expect(screen.queryByText('Q1? 的答案')).not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: '评价这次回忆' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '显示答案' }));
    expect(await screen.findByText('Q1? 的答案')).toBeInTheDocument();
    const ratingGroup = screen.getByRole('group', { name: '评价这次回忆' });
    expect(ratingGroup).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^正确/ }));
    // 成功后推进到第 2 张，答案再次隐藏
    expect(await screen.findByText(/第 2 \/ 2 张/)).toBeInTheDocument();
    expect(screen.queryByText('Q1? 的答案')).not.toBeInTheDocument();

    const [, init] = pendingReviews().at(-1) ?? [];
    const body = JSON.parse(String(init?.body));
    expect(body.cardId).toBe('card1');
    expect(body.version).toBe(1);
    expect(body.rating).toBe('correct');
    expect(typeof body.mutationId).toBe('string');
    expect(body.mutationId.length).toBeGreaterThan(0);
  });

  it('评价失败留在当前卡，重试复用同一 mutationId（幂等），不虚增完成量', async () => {
    reviewFailure = 'once';
    mount();
    fireEvent.click(await screen.findByRole('button', { name: /开始今日练习 · 2 张/ }));
    expect(await screen.findByText('Q1?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '显示答案' }));
    fireEvent.click(await screen.findByRole('button', { name: /^正确/ }));

    // 失败：仍在第 1 张
    expect(await screen.findByText(/第 1 \/ 2 张/)).toBeInTheDocument();
    expect(await screen.findByRole('alert')).toHaveTextContent(/云端服务暂时不可用|失败/);

    const firstBody = JSON.parse(String(pendingReviews()[0][1]?.body));
    // 重试按钮 → 同一 mutationId 重发
    fireEvent.click(await screen.findByRole('button', { name: '重试' }));
    await waitFor(() => expect(pendingReviews()).toHaveLength(2));
    const retryBody = JSON.parse(String(pendingReviews()[1][1]?.body));
    expect(retryBody.mutationId).toBe(firstBody.mutationId);
    expect(retryBody.cardId).toBe('card1');
    // 重试成功后推进到第 2 张
    expect(await screen.findByText(/第 2 \/ 2 张/)).toBeInTheDocument();
  });
});

describe('随机浏览：只读无写入', () => {
  it('浏览只发 GET，切卡隐藏答案，不产生任何 POST', async () => {
    mount();
    // 从库行进入随机浏览
    const browseButtons = await screen.findAllByRole('button', { name: '随机浏览' });
    fireEvent.click(browseButtons[0]);
    // Fisher–Yates 后首卡随机，按正则匹配 Q1?/Q2?；答案默认隐藏
    expect(await screen.findByRole('heading', { name: /^Q[12]\?$/ })).toBeInTheDocument();
    expect(screen.queryByText(/Q[12]\? 的答案/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '显示答案' }));
    expect(await screen.findByText(/Q[12]\? 的答案/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '下一张' }));
    // 已到末位：下一张禁用、答案再次隐藏
    expect(await screen.findByRole('button', { name: '下一张' })).toBeDisabled();
    expect(screen.queryByText(/Q[12]\? 的答案/)).not.toBeInTheDocument();

    const posts = request.mock.calls.filter(([, init]) => init?.method === 'POST');
    expect(posts).toHaveLength(0);
  });
});

describe('账号切换与统计', () => {
  it('退出广播后清理本机状态回到登录门', async () => {
    mount();
    expect(await screen.findByText('我的卡片库')).toBeInTheDocument();
    window.dispatchEvent(new Event('dblog-account-change'));
    expect(await screen.findByText('登录后，查看自己的卡片库')).toBeInTheDocument();
  });

  it('统计视图渲染折线与热力图，未来格不可交互', async () => {
    mount();
    fireEvent.click(await screen.findByRole('button', { name: /查看学习统计/ }));
    expect(await screen.findByRole('heading', { name: '学习统计' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /近7日去重练习量/ })).toBeInTheDocument();
    const heatButtons = screen.getAllByRole('button', { name: /·/ });
    expect(heatButtons.length).toBeGreaterThan(0);
    // 点击某天 → 明细更新，live region 同步显示当日提示（mobile tap 可靠）
    const target = heatButtons[heatButtons.length - 1];
    fireEvent.click(target);
    await waitFor(() => expect(screen.getByText('2026-10-26')).toBeInTheDocument());
    expect(screen.getByText('2026-10-26 · 1 张卡片')).toBeInTheDocument();
  });

  it('随机浏览切完所有卡片不重复，切卡隐藏答案且全程无 POST', async () => {
    mount();
    const browseButtons = await screen.findAllByRole('button', { name: '随机浏览' });
    fireEvent.click(browseButtons[0]);
    const seen = new Set<string>();
    seen.add((await screen.findByRole('heading', { name: /^Q[12]\?$/ })).textContent!);
    fireEvent.click(screen.getByRole('button', { name: '显示答案' }));
    expect(await screen.findByText(/Q[12]\? 的答案/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '下一张' }));
    seen.add((await screen.findByRole('heading', { name: /^Q[12]\?$/ })).textContent!);
    expect(seen.size).toBe(2);
    expect(screen.queryByText(/Q[12]\? 的答案/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '下一张' })).toBeDisabled();
    expect(request.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(0);
  });

  it('编辑卡片默认保留排期（resetProgress=false），携带版本号并发控制', async () => {
    mount();
    // 进入库详情
    fireEvent.click(await screen.findByRole('button', { name: 'Go 语言' }));
    // 卡片列表加载后，点第一张卡的「编辑」
    fireEvent.click((await screen.findAllByRole('button', { name: '编辑' }))[0]);
    // 对话框打开，直接提交（默认不勾「重新学习」）
    await screen.findByRole('dialog');
    fireEvent.click(screen.getByRole('button', { name: /保存卡片/ }));
    await waitFor(() =>
      expect(
        request.mock.calls.find(([url, init]) => String(url).includes('/anki/cards/card1') && init?.method === 'PATCH'),
      ).toBeTruthy(),
    );
    const patchCall = request.mock.calls.find(
      ([url, init]) => String(url).includes('/anki/cards/card1') && init?.method === 'PATCH',
    );
    const body = JSON.parse(String(patchCall?.[1]?.body));
    expect(body.resetProgress).toBe(false);
    expect(body.version).toBe(1);
    expect(body.deckId).toBe('d1');
  });
});

const jsonResponse = (value: unknown) => new Response(JSON.stringify(value), { status: 200 });
const MULTI_DECKS = [...DASHBOARD.decks, { ...DASHBOARD.decks[0], id: 'd2', name: '第二个库' }];
const FORM_DASHBOARD = { ...DASHBOARD, decks: MULTI_DECKS, todayCards: 1 };

describe('Anki 缺口回归', () => {
  it('账号退出取消在途请求，晚到响应不能恢复旧账号卡片', async () => {
    const pending: Array<(value: Response) => void> = [];
    request.mockImplementation(() => new Promise<Response>((resolve) => pending.push(resolve)));
    mount();
    fireEvent(window, new Event('dblog-account-change'));
    expect(await screen.findByText('登录后，查看自己的卡片库')).toBeInTheDocument();
    await act(async () => {
      pending.forEach((resolve) => resolve(jsonResponse(DASHBOARD)));
    });
    expect(screen.queryByText('我的卡片库')).not.toBeInTheDocument();
    expect(screen.queryByText('Go 语言')).not.toBeInTheDocument();
    expect(request.mock.calls.every(([, init]) => init?.signal?.aborted)).toBe(true);
  });

  it('API 返回 HTML 时明确报错，故障页可进入显式登录页，保留故障提示', async () => {
    request.mockResolvedValue(new Response('<html>blog</html>', { headers: { 'content-type': 'text/html' } }));
    mount();
    expect(await screen.findByRole('alert')).toHaveTextContent('账号 API 返回了博客页面');
    fireEvent.click(screen.getByRole('link', { name: '查看登录页面' }));
    expect(await screen.findByText('登录后，查看自己的卡片库')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '使用 GitHub 登录' })).toHaveAttribute(
      'href',
      '/api/v1/auth/github/start?return_to=%2Fanki',
    );
    expect(screen.getByRole('alert')).toHaveTextContent('当前无法确认登录状态');
  });

  it('显式登录页与 OAuth 回跳继承 /Blog basename', async () => {
    request.mockResolvedValue(new Response('unauthorized', { status: 401 }));
    render(
      <HelmetProvider>
        <MemoryRouter basename="/Blog" initialEntries={['/Blog/anki/login']}>
          <AnkiPage />
        </MemoryRouter>
      </HelmetProvider>,
    );
    expect(await screen.findByRole('link', { name: '使用 GitHub 登录' })).toHaveAttribute(
      'href',
      '/api/v1/auth/github/start?return_to=%2FBlog%2Fanki',
    );
  });

  it('全部队列失败显示失败并允许重新加载，不误报练习完成', async () => {
    request.mockResolvedValue(new Response('offline', { status: 503 }));
    render(<AnkiReview decks={MULTI_DECKS} deckId={null} onExit={vi.fn()} onSessionSettled={vi.fn()} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('到期队列加载失败');
    expect(screen.queryByText('本轮练习完成')).not.toBeInTheDocument();
    request.mockResolvedValue(jsonResponse({ cards: [makeCard('card1', 'Q1?')], previews: {} }));
    fireEvent.click(screen.getByRole('button', { name: '重新加载队列' }));
    expect(await screen.findByText('Q1?')).toBeInTheDocument();
  });

  it('跨库先复习后新卡，两个库的间隔预览都保留', async () => {
    const fresh = { ...makeCard('fresh', '新卡?'), reviewCount: 0 };
    const review = { ...makeCard('review', '复习卡?'), deckId: 'd2' };
    request.mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/reviews')) return jsonResponse({ card: { ...review, version: 2 } });
      const card = url.includes('/d2/') ? review : fresh;
      return jsonResponse({
        cards: [card],
        previews: { [card.id]: { againMinutes: 10, nextDays: card.id === 'review' ? 6 : 1 } },
      });
    });
    render(<AnkiReview decks={MULTI_DECKS} deckId={null} onExit={vi.fn()} onSessionSettled={vi.fn()} />);
    expect(await screen.findByText('复习卡?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '显示答案' }));
    fireEvent.click(screen.getByRole('checkbox', { name: '显示下次间隔' }));
    expect(screen.getByRole('button', { name: /^正确/ })).toHaveTextContent('6 天后');
    fireEvent.click(screen.getByRole('button', { name: /^正确/ }));
    await screen.findByText('新卡?');
    fireEvent.click(screen.getByRole('button', { name: '显示答案' }));
    expect(screen.getByRole('button', { name: /^正确/ })).toHaveTextContent('1 天后');
  });

  it('部分库失败在已加载卡片练完后仍保留警告', async () => {
    request.mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/d2/')) return new Response('error', { status: 503 });
      if (url.endsWith('/reviews')) return jsonResponse({ card: makeCard('card1', 'Q1?', 2) });
      return jsonResponse({ cards: [makeCard('card1', 'Q1?')], previews: {} });
    });
    render(<AnkiReview decks={MULTI_DECKS} deckId={null} onExit={vi.fn()} onSessionSettled={vi.fn()} />);
    await screen.findByText('Q1?');
    expect(screen.getByRole('alert')).toHaveTextContent('部分卡片库队列加载失败');
    fireEvent.click(screen.getByRole('button', { name: '显示答案' }));
    fireEvent.click(screen.getByRole('button', { name: /^正确/ }));
    expect(await screen.findByText('已加载卡片练习完成')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('未加载的部分');
  });

  it('中途退出练习重新获取统计并更新待练数量', async () => {
    let reviewed = false;
    request.mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/dashboard'))
        return jsonResponse({
          ...DASHBOARD,
          today: reviewed ? 2 : 1,
          decks: [{ ...DASHBOARD.decks[0], due: reviewed ? 1 : 2 }],
        });
      if (url.endsWith('/reviews')) {
        reviewed = true;
        return jsonResponse({ card: makeCard('card1', 'Q1?', 2) });
      }
      return jsonResponse({ cards: [makeCard('card1', 'Q1?'), makeCard('card2', 'Q2?')] });
    });
    mount();
    fireEvent.click(await screen.findByRole('button', { name: /开始今日练习 · 2 张/ }));
    await screen.findByText('Q1?');
    fireEvent.click(screen.getByRole('button', { name: '显示答案' }));
    fireEvent.click(screen.getByRole('button', { name: /^正确/ }));
    await screen.findByText('Q2?');
    fireEvent.click(screen.getByRole('button', { name: '退出练习' }));
    expect(await screen.findByRole('button', { name: /开始今日练习 · 1 张/ })).toBeInTheDocument();
    expect(screen.getByText(/今日目标/)).toHaveTextContent('2 / 12');
  });

  it('最后一卡后刷新统计不卸载完成页，不重新加载队列', async () => {
    let reviewed = false;
    request.mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/dashboard'))
        return jsonResponse({ ...DASHBOARD, decks: [{ ...DASHBOARD.decks[0], due: reviewed ? 0 : 1 }] });
      if (url.endsWith('/reviews')) {
        reviewed = true;
        return jsonResponse({ card: makeCard('card1', 'Q1?', 2) });
      }
      return jsonResponse({ cards: [makeCard('card1', 'Q1?')] });
    });
    mount();
    fireEvent.click(await screen.findByRole('button', { name: /开始今日练习 · 1 张/ }));
    await screen.findByText('Q1?');
    const queueCount = request.mock.calls.filter(([url]) => String(url).endsWith('/queue')).length;
    fireEvent.click(screen.getByRole('button', { name: '显示答案' }));
    fireEvent.click(screen.getByRole('button', { name: /^正确/ }));
    expect(await screen.findByText('本轮练习完成')).toBeInTheDocument();
    await waitFor(() =>
      expect(request.mock.calls.filter(([url]) => String(url).endsWith('/dashboard')).length).toBeGreaterThan(1),
    );
    expect(screen.getByText('本轮练习完成')).toBeInTheDocument();
    expect(request.mock.calls.filter(([url]) => String(url).endsWith('/queue'))).toHaveLength(queueCount);
  });

  it('编辑使用卡片原库，并提交迁库字段与显式重学提示', async () => {
    request.mockResolvedValue(jsonResponse(makeCard('card2', 'Q2?', 2)));
    const done = vi.fn();
    render(
      <AnkiDialogs
        state={{ kind: 'card', card: { ...makeCard('card2', 'Q2?'), deckId: 'd2' } }}
        dashboard={FORM_DASHBOARD}
        onClose={vi.fn()}
        onDone={done}
      />,
    );
    expect(screen.getByRole('combobox')).toHaveValue('d2');
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'd1' } });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: '保存卡片' }));
    await waitFor(() => expect(done).toHaveBeenCalledWith('卡片已保存，已重新学习，历史记录保留。'));
    expect(JSON.parse(String(request.mock.calls[0][1]?.body))).toMatchObject({
      deckId: 'd1',
      resetProgress: true,
      version: 1,
    });
  });

  it('单卡重洗仍隐藏答案，不发写请求', async () => {
    request.mockImplementation(async (input) =>
      String(input).endsWith('/dashboard')
        ? jsonResponse(DASHBOARD)
        : jsonResponse({ cards: [makeCard('card1', 'Q1?')] }),
    );
    mount();
    fireEvent.click((await screen.findAllByRole('button', { name: '随机浏览' }))[0]);
    await screen.findByText('Q1?');
    fireEvent.click(screen.getByRole('button', { name: '显示答案' }));
    fireEvent.click(screen.getByRole('button', { name: '重新洗牌' }));
    expect(screen.queryByText('Q1? 的答案')).not.toBeInTheDocument();
    expect(request.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(0);
  });

  it('分类已成功但建库失败，重试沿用新分类而不重复创建', async () => {
    let deckAttempts = 0;
    request.mockImplementation(async (input) => {
      if (String(input).endsWith('/categories')) return jsonResponse({ id: 'new-category', name: '新分类' });
      deckAttempts += 1;
      return deckAttempts === 1 ? new Response('error', { status: 503 }) : jsonResponse({ id: 'new-deck' });
    });
    const done = vi.fn();
    render(<AnkiDialogs state={{ kind: 'deck' }} dashboard={FORM_DASHBOARD} onClose={vi.fn()} onDone={done} />);
    fireEvent.change(screen.getByLabelText('卡片库名称'), { target: { value: '新库' } });
    fireEvent.change(screen.getByLabelText('所属分类'), { target: { value: '新分类' } });
    fireEvent.click(screen.getByRole('button', { name: '创建卡片库' }));
    await screen.findByRole('alert');
    await waitFor(() => expect(screen.getByRole('button', { name: '创建卡片库' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: '创建卡片库' }));
    await waitFor(() => expect(done).toHaveBeenCalledWith('卡片库已创建。'));
    expect(request.mock.calls.filter(([url]) => String(url).endsWith('/categories'))).toHaveLength(1);
    expect(deckAttempts).toBe(2);
  });

  it('分类响应丢失时从服务端列表恢复，不重复创建分类', async () => {
    request.mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/categories')) return new Response('lost', { status: 503 });
      if (url.endsWith('/dashboard'))
        return jsonResponse({ ...DASHBOARD, categories: [{ id: 'recovered', name: '新分类' }] });
      return jsonResponse({ id: 'created' });
    });
    const done = vi.fn();
    render(<AnkiDialogs state={{ kind: 'deck' }} dashboard={FORM_DASHBOARD} onClose={vi.fn()} onDone={done} />);
    fireEvent.change(screen.getByLabelText('卡片库名称'), { target: { value: '新库' } });
    fireEvent.change(screen.getByLabelText('所属分类'), { target: { value: '新分类' } });
    fireEvent.click(screen.getByRole('button', { name: '创建卡片库' }));
    await waitFor(() => expect(done).toHaveBeenCalled());
    const call = request.mock.calls.find(([url]) => String(url).endsWith('/decks'));
    expect(JSON.parse(String(call?.[1]?.body))).toMatchObject({ categoryId: 'recovered' });
  });

  it('关闭新建弹窗取消在途分类请求，晚到响应不会继续建库', async () => {
    let release: ((response: Response) => void) | undefined;
    request.mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          release = resolve;
        }),
    );
    const done = vi.fn();
    const rendered = render(
      <AnkiDialogs state={{ kind: 'deck' }} dashboard={FORM_DASHBOARD} onClose={vi.fn()} onDone={done} />,
    );
    fireEvent.change(screen.getByLabelText('卡片库名称'), { target: { value: '新库' } });
    fireEvent.change(screen.getByLabelText('所属分类'), { target: { value: '新分类' } });
    fireEvent.click(screen.getByRole('button', { name: '创建卡片库' }));
    rendered.unmount();
    expect(request.mock.calls[0][1]?.signal?.aborted).toBe(true);
    await act(async () => {
      release?.(jsonResponse({ id: 'created' }));
    });
    expect(request.mock.calls.filter(([url]) => String(url).endsWith('/decks'))).toHaveLength(0);
    expect(done).not.toHaveBeenCalled();
  });
});
