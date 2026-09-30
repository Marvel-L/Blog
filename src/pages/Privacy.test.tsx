import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { Privacy } from './Privacy';

const unlockPrivacyPosts = vi.fn();

vi.mock('@/services/busuanzi', () => ({
  pingBusuanzi: vi.fn(),
  fillBusuanziSpans: vi.fn(),
}));

vi.mock('@/services/privacyPosts', () => ({
  unlockPrivacyPosts: (...args: unknown[]) => unlockPrivacyPosts(...args),
}));

const renderPrivacy = (initialEntry = '/privacy') => {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/privacy" element={<Privacy />} />
      </Routes>
    </MemoryRouter>,
  );
};

describe('Privacy', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    unlockPrivacyPosts.mockReset();
    unlockPrivacyPosts.mockResolvedValue([
      {
        id: 'private-welcome',
        title: '隐私区示例文章',
        excerpt: '示例摘要',
        date: '2026-09-30',
        updatedAt: '2026-09-30',
        tags: ['private'],
        category: '隐私',
        filePath: '/packages/privacy-posts/content/welcome.md',
        readTime: '1分钟阅读',
        content: '这是一篇私密文章正文。',
      },
    ]);
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

  it('未验证时只显示密码入口', () => {
    renderPrivacy();

    expect(screen.getByRole('heading', { name: '隐私页' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '输入密码' })).toBeInTheDocument();
    expect(screen.queryByText('隐私区示例文章')).not.toBeInTheDocument();
  });

  it('密码校验通过后显示私密文章内容', async () => {
    const user = userEvent.setup();
    renderPrivacy();

    await user.click(screen.getByRole('button', { name: '输入密码' }));
    await user.type(screen.getByLabelText('隐私页密码'), 'Mx179516');
    await user.click(screen.getByRole('button', { name: '验证并进入' }));

    expect(await screen.findByRole('link', { name: '阅读文章：隐私区示例文章' })).toBeInTheDocument();
    expect(screen.getByText('这是一篇私密文章正文。')).toBeInTheDocument();
  });

  it('已记录访问状态时，水合后恢复解锁态', async () => {
    window.sessionStorage.setItem('d-blog-privacy-access', 'granted');
    window.sessionStorage.setItem('d-blog-privacy-password', 'Mx179516');
    renderPrivacy();

    await waitFor(() => {
      expect(screen.getByRole('link', { name: '阅读文章：隐私区示例文章' })).toBeInTheDocument();
    });
  });
});
