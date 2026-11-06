import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { Home } from './Home';
import { getInitialPosts } from '@/services/posts';
import { getReadingHistory, saveReadingHistory } from '@/services/readingHistory';
import { siteConfig } from '@config/site.config';

let route = '';
const RouteProbe = () => {
  const location = useLocation();
  route = location.pathname + location.search + location.hash;
  return null;
};

const renderHome = (initialEntry = '/') =>
  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <RouteProbe />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/articles" element={<h1>文章列表入口</h1>} />
      </Routes>
    </MemoryRouter>,
  );

describe('Home', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    window.sessionStorage.clear();
    route = '';
  });

  it('独立首页保留封面与诗词，移除浏览文章引导', async () => {
    renderHome();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(siteConfig.title);
    expect(await screen.findByRole('figure', { name: '每日诗词与名言' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '浏览文章' })).not.toBeInTheDocument();
    expect(screen.queryByRole('searchbox', { name: '搜索文章' })).not.toBeInTheDocument();
    expect(document.getElementById('posts-list')).toBeNull();
  });

  it.each(['?category=算法', '?q=react', '?sort=oldest&page=2'])('旧首页参数 %s 保留并转到文章列表', async (query) => {
    renderHome(`/${query}`);
    await waitFor(() => expect(route).toBe(`/articles${query}`));
    expect(screen.getByRole('heading', { name: '文章列表入口' })).toBeInTheDocument();
  });

  it('已有阅读进度时首页不展示继续阅读，也不清除进度', () => {
    const post = getInitialPosts()[0];
    saveReadingHistory({ postId: post.id, progress: 0.4, updatedAt: 1000 });
    renderHome();
    expect(screen.queryByRole('link', { name: /继续阅读：/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/已阅读 40%/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /放弃阅读：/ })).not.toBeInTheDocument();
    expect(getReadingHistory()).toEqual([{ postId: post.id, progress: 0.4, updatedAt: 1000 }]);
  });
});
