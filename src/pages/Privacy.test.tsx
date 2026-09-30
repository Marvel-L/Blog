import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { Privacy } from './Privacy';

vi.mock('@/services/busuanzi', () => ({
  pingBusuanzi: vi.fn(),
  fillBusuanziSpans: vi.fn(),
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

  it('未验证时保持锁定态', () => {
    renderPrivacy();

    expect(screen.getByRole('heading', { name: '隐私页' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '输入密码' })).toBeInTheDocument();
    expect(screen.queryByText('内容暂未放入')).not.toBeInTheDocument();
    expect(screen.getByText('入口现在收在首页页脚版权行的右侧。点击透明笑脸后会先弹出密码框，只有验证通过才会进入这里。')).toBeInTheDocument();
  });

  it('密码校验通过后显示隐私内容占位', async () => {
    const user = userEvent.setup();
    renderPrivacy();

    await user.click(screen.getByRole('button', { name: '输入密码' }));
    await user.type(screen.getByLabelText('隐私页密码'), 'Mx179516');
    await user.click(screen.getByRole('button', { name: '验证并进入' }));

    expect(await screen.findByText('内容暂未放入')).toBeInTheDocument();
    expect(screen.getByText('当前会话已解锁')).toBeInTheDocument();
  });

  it('已记录访问状态时，水合后恢复解锁态', async () => {
    window.sessionStorage.setItem('d-blog-privacy-access', 'granted');
    renderPrivacy();

    await waitFor(() => {
      expect(screen.getByText('内容暂未放入')).toBeInTheDocument();
    });
  });
});
