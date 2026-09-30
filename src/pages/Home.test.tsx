import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation, useSearchParams } from 'react-router-dom';
import { Home } from './Home';

// URL 探针：MemoryRouter 不更新 window.location，断言搜索参数必须经
// useSearchParams 读取（否则「清除搜索后参数移除」的断言恒真、无回归保护）。
let probeSearch = '';
let probePathname = '';
const SearchParamsProbe = () => {
  const [searchParams] = useSearchParams();
  probeSearch = searchParams.toString();
  return null;
};

const LocationProbe = () => {
  probePathname = useLocation().pathname;
  return null;
};

// 弹层与工具组件用 stub 替代，聚焦 Home 自身行为。
vi.mock('@/components/ShareModal', () => ({
  ShareModal: () => <div data-testid="mock-share-modal" />,
}));
vi.mock('@/services/busuanzi', () => ({
  pingBusuanzi: vi.fn(),
  fillBusuanziSpans: vi.fn(),
}));
vi.mock('@/services/readingHistory', () => ({
  getReadingHistory: vi.fn(() => []),
  saveReadingHistory: vi.fn(),
  subscribeReadingHistory: vi.fn(() => () => {}),
  removeReadingHistory: vi.fn(),
}));

const renderHome = (initialEntry = '/') =>
  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route
          path="*"
          element={
            <>
              <Home />
              <SearchParamsProbe />
              <LocationProbe />
            </>
          }
        />
        <Route
          path="/privacy"
          element={
            <>
              <div>隐私页面内容</div>
              <LocationProbe />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  );

describe('Home', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    probeSearch = '';
    probePathname = '/';
    window.sessionStorage.clear();
    // jsdom 不实现 matchMedia：useReducedMotion/useMediaQuery 等依赖媒体查询。
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  });

  it('渲染站点英雄区（标题与副标题）', async () => {
    renderHome();
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(await screen.findByRole('figure', { name: '每日诗词与名言' })).toBeInTheDocument();
  });

  it('渲染文章卡片列表（来自构建期数据）', () => {
    renderHome();
    // 首页应有至少一个文章链接（卡片标题链接）
    const postLinks = screen.getAllByRole('link', { name: /阅读文章：/ });
    expect(postLinks.length).toBeGreaterThan(0);
  });

  it('分类筛选：点击分类按钮后该分类被选中', async () => {
    const user = userEvent.setup();
    renderHome();
    const categoryButtons = screen.getAllByRole('button', { name: /^(算法|日常|Golang)$/ });
    expect(categoryButtons.length).toBeGreaterThan(0);

    await user.click(categoryButtons[0]);
    expect(categoryButtons[0]).toHaveAttribute('aria-pressed', 'true');
  });

  it('URL 带 ?category= 时应用 URL 分类筛选', async () => {
    renderHome('/?category=算法');
    // effect 同步 URL 分类后：算法选中、全部未选中
    const categoryButton = await screen.findByRole('button', { name: '算法' });
    expect(categoryButton).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '全部' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('打开分享弹层：点击卡片分享按钮', async () => {
    const user = userEvent.setup();
    renderHome();
    const shareButtons = screen.getAllByRole('button', { name: /分享文章：/ });
    expect(shareButtons.length).toBeGreaterThan(0);
    await user.click(shareButtons[0]);
    expect(await screen.findByTestId('mock-share-modal')).toBeInTheDocument();
  });

  it('URL 带 ?q= 时同步到搜索框', async () => {
    renderHome('/?q=react');
    const input = await screen.findByRole('searchbox', { name: '搜索文章' });
    await waitFor(() => expect(input).toHaveValue('react'));
  });

  it('输入搜索词后输入框保持用户输入不被 URL 同步回退（v7_startTransition 竞态回归）', async () => {
    const user = userEvent.setup();
    renderHome();
    const input = screen.getByRole('searchbox', { name: '搜索文章' });

    await user.type(input, 'react');
    // 击键后 URL 异步提交期间，URL→state 回写不得把输入内容回退。
    await waitFor(() => expect(input).toHaveValue('react'));
    expect(input).toHaveValue('react');
  });

  it('清除搜索后 URL 的 q 参数被移除', async () => {
    const user = userEvent.setup();
    renderHome('/?q=react');
    const input = await screen.findByRole('searchbox', { name: '搜索文章' });
    await waitFor(() => expect(input).toHaveValue('react'));

    await user.click(screen.getByRole('button', { name: '清除搜索' }));
    await waitFor(() => expect(input).toHaveValue(''));
    // URL 中不再有 q 参数。
    await waitFor(() => {
      expect(probeSearch).not.toContain('q=');
    });
  });

  it('点击右下角笑脸后，密码验证通过才跳转隐私页', async () => {
    const user = userEvent.setup();
    renderHome();

    await user.click(screen.getByRole('button', { name: '打开隐私页密码框' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();

    await user.type(screen.getByLabelText('隐私页密码'), 'wrong-password');
    await user.click(screen.getByRole('button', { name: '验证并进入' }));
    expect(await screen.findByText('密码错误，请重新输入。')).toBeInTheDocument();
    expect(probePathname).toBe('/');

    await user.clear(screen.getByLabelText('隐私页密码'));
    await user.type(screen.getByLabelText('隐私页密码'), 'Mx179516');
    await user.click(screen.getByRole('button', { name: '验证并进入' }));

    await waitFor(() => expect(probePathname).toBe('/privacy'));
    expect(await screen.findByText('隐私页面内容')).toBeInTheDocument();
  });
});
