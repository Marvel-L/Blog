import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AnkiMarkdown } from './AnkiMarkdown';
import { AnkiDialogs } from './AnkiDialogs';
import { AnkiBrowse } from './AnkiBrowse';
import { AnkiDeckDetail } from './AnkiDeckDetail';
import { AnkiReview } from './AnkiReview';
import type { AnkiCard, NormalizedDashboard } from './anki-api';

const markdown =
  '# 答案标题\n\n**关键点**\n\n- 项目一\n- 项目二\n\n> 引用\n\n```go\nfmt.Println("ok")\n```\n\n| 名称 | 内容 |\n| --- | --- |\n| 卡片 | Markdown |';
const card: AnkiCard = {
  id: 'card1',
  deckId: 'd1',
  question: '**问题**',
  answer: markdown,
  dueAt: '2026-10-27T10:00:00Z',
  intervalDays: 3,
  repetitions: 1,
  easeFactor: 2.5,
  reviewCount: 1,
  version: 2,
};
const dashboard: NormalizedDashboard = {
  categories: [{ id: 'c1', name: '分类' }],
  decks: [{ id: 'd1', categoryId: 'c1', name: '测试库', total: 1, learned: 1, stable: 0, due: 1 }],
  goal: 12,
  today: 0,
  todayCards: 0,
  timeZone: 'Asia/Shanghai',
  history: [],
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.documentElement.classList.remove('dark');
});

describe('Anki Markdown 安全渲染', () => {
  it('真实渲染标题、加粗、列表、引用、代码和 GFM 表格', () => {
    const { container } = render(<AnkiMarkdown content={markdown} />);
    expect(screen.getByRole('heading', { name: '答案标题' })).toBeInTheDocument();
    expect(container.querySelector('strong')).toHaveTextContent('关键点');
    expect(container.querySelectorAll('li')).toHaveLength(2);
    expect(container.querySelector('blockquote')).toHaveTextContent('引用');
    expect(container.querySelector('pre code')).toHaveTextContent('fmt.Println("ok")');
    expect(screen.getByRole('table')).toHaveTextContent('Markdown');
  });

  it('HTML、脚本、事件属性与危险协议无法变为可执行 DOM，不加载远程图片', () => {
    const malicious =
      '<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n\n<iframe src="https://example.com"></iframe>\n\n[危险](javascript:alert%281%29)\n\n[数据](data:text/html;base64,AAA)\n\n[文件](file:///etc/passwd)\n\n![图片](https://example.com/tracker.png)';
    const { container } = render(<AnkiMarkdown content={malicious} />);
    expect(container.querySelector('script,img,iframe,svg,[onerror],[onclick]')).toBeNull();
    expect(container.querySelector('a')).toBeNull();
    expect(screen.getByText('危险')).toBeInTheDocument();
    expect(screen.getByText('[图片：图片]')).toBeInTheDocument();
  });

  it('正常 HTTPS 和 mailto 链接可用，隔离新窗口权限', () => {
    render(<AnkiMarkdown content={'[文档](https://example.com/docs) [邮件](mailto:me@example.com)'} />);
    expect(screen.getByRole('link', { name: '文档' })).toHaveAttribute('href', 'https://example.com/docs');
    expect(screen.getByRole('link', { name: '文档' })).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.getByRole('link', { name: '邮件' })).toHaveAttribute('href', 'mailto:me@example.com');
  });

  it('SSR 与客户端渲染确定，不依赖浏览器主题或时钟', () => {
    const server = renderToString(<AnkiMarkdown content={markdown} />);
    document.documentElement.classList.add('dark');
    const { container } = render(<AnkiMarkdown content={markdown} />);
    const serverDom = new DOMParser().parseFromString(server, 'text/html');
    expect(container.innerHTML).toBe(serverDom.body.innerHTML);
  });
});

describe('新建与编辑 Markdown 源码', () => {
  it.each([false, true])('编辑=%s：切换预览保留草稿，提交源码而不是 HTML，默认保留排期', async (editing) => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(card)));
    vi.stubGlobal('fetch', request);
    const done = vi.fn();
    render(
      <AnkiDialogs
        state={{ kind: 'card', ...(editing ? { card } : { deckId: 'd1' }) }}
        dashboard={dashboard}
        onClose={vi.fn()}
        onDone={done}
      />,
    );
    fireEvent.change(screen.getByLabelText('Q · 问题'), { target: { value: '**我的问题**' } });
    fireEvent.change(screen.getByLabelText('A · 答案'), { target: { value: markdown } });
    fireEvent.click(screen.getByRole('button', { name: '预览 Markdown · A · 答案' }));
    expect(screen.getByRole('region', { name: 'A · 答案 Markdown 预览' })).toHaveTextContent('答案标题');
    fireEvent.click(screen.getByRole('button', { name: '继续编辑 · A · 答案' }));
    expect(screen.getByLabelText('A · 答案')).toHaveValue(markdown);
    fireEvent.click(screen.getByRole('button', { name: '保存卡片' }));
    await waitFor(() => expect(done).toHaveBeenCalled());
    expect(request).toHaveBeenCalledTimes(1);
    const [url, init] = request.mock.calls[0];
    expect(String(url)).toContain(editing ? '/anki/cards/card1' : '/anki/decks/d1/cards');
    expect(init?.method).toBe(editing ? 'PATCH' : 'POST');
    expect(JSON.parse(String(init?.body))).toMatchObject({ question: '**我的问题**', answer: markdown });
    if (editing) expect(JSON.parse(String(init?.body))).toMatchObject({ resetProgress: false, version: 2 });
  });

  it('预览空内容时提示，提交空白仍报错，不发保存请求', () => {
    const request = vi.fn();
    vi.stubGlobal('fetch', request);
    render(
      <AnkiDialogs state={{ kind: 'card', deckId: 'd1' }} dashboard={dashboard} onClose={vi.fn()} onDone={vi.fn()} />,
    );
    fireEvent.change(screen.getByLabelText('Q · 问题'), { target: { value: ' ' } });
    fireEvent.change(screen.getByLabelText('A · 答案'), { target: { value: ' ' } });
    fireEvent.click(screen.getByRole('button', { name: '预览 Markdown · A · 答案' }));
    expect(screen.getByText('还没有内容，请先编辑。')).toBeInTheDocument();
    fireEvent.submit(screen.getByRole('button', { name: '保存卡片' }).closest('form')!);
    expect(screen.getByRole('alert')).toHaveTextContent('不能为空');
    expect(request).not.toHaveBeenCalled();
  });

  it('保存保留 Markdown 的前导缩进和尾部换行', async () => {
    const source = '    fmt.Println("indented code")\n';
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(card)));
    vi.stubGlobal('fetch', request);
    render(<AnkiDialogs state={{ kind: 'card', card }} dashboard={dashboard} onClose={vi.fn()} onDone={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('A · 答案'), { target: { value: source } });
    fireEvent.click(screen.getByRole('button', { name: '保存卡片' }));
    await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
    expect(JSON.parse(String(request.mock.calls[0][1]?.body)).answer).toBe(source);
  });

  it('保存失败保留 Markdown 草稿与错误提示', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('error', { status: 503 })));
    const done = vi.fn();
    render(<AnkiDialogs state={{ kind: 'card', card }} dashboard={dashboard} onClose={vi.fn()} onDone={done} />);
    fireEvent.click(screen.getByRole('button', { name: '保存卡片' }));
    await screen.findByRole('alert');
    expect(screen.getByLabelText('A · 答案')).toHaveValue(markdown);
    expect(done).not.toHaveBeenCalled();
  });
});

describe('各展示入口与深色样式隔离', () => {
  it.each(['detail', 'browse', 'review'] as const)(
    '%s：默认不渲染答案，主动揭示后使用同一 Markdown 渲染器，无深色黑块类名',
    async (view) => {
      document.documentElement.classList.add('dark');
      vi.stubGlobal(
        'fetch',
        vi.fn().mockImplementation(async () => new Response(JSON.stringify({ cards: [card], previews: {} }))),
      );
      const { container } = render(
        view === 'detail' ? (
          <AnkiDeckDetail
            deck={dashboard.decks[0]}
            categoryName="分类"
            onBack={vi.fn()}
            onNewCard={vi.fn()}
            onEditCard={vi.fn()}
            onBrowse={vi.fn()}
            onPractice={vi.fn()}
          />
        ) : view === 'browse' ? (
          <AnkiBrowse deckId="d1" deckName="测试库" onExit={vi.fn()} />
        ) : (
          <AnkiReview decks={dashboard.decks} deckId="d1" onExit={vi.fn()} onSessionSettled={vi.fn()} />
        ),
      );
      await screen.findByText('问题');
      expect(screen.queryByRole('heading', { name: '答案标题' })).not.toBeInTheDocument();
      expect(container.innerHTML).not.toContain('dark:');
      fireEvent.click(screen.getByRole('button', { name: view === 'detail' ? '查看答案' : '显示答案' }));
      const answer = screen.getByRole('region', { name: '卡片答案' });
      expect(within(answer).getByRole('heading', { name: '答案标题' })).toBeInTheDocument();
      expect(within(answer).getByRole('table')).toBeInTheDocument();
      expect(document.documentElement).toHaveClass('dark');
    },
  );

  it.each(['card', 'deck', 'goal'] as const)('%s 弹层通过局部样式隔离，输入不使用全局 dark 类', (kind) => {
    document.documentElement.classList.add('dark');
    render(<AnkiDialogs state={{ kind }} dashboard={dashboard} onClose={vi.fn()} onDone={vi.fn()} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog.querySelector('.anki-dialog-panel')).not.toBeNull();
    expect(dialog.querySelector('.editorial-input')).toBeNull();
    expect(dialog.querySelector('.anki-input')).not.toBeNull();
    expect(document.documentElement).toHaveClass('dark');
  });
});
