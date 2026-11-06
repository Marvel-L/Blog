import { StrictMode } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { hasOpenOverlay } from '@/hooks/useModalOverlay';
import { BookShelf } from './BookShelf';
import { buildBooks } from './books-core.mjs';
import { catalog, packageDefinitions } from './book-fixtures';

const books = buildBooks(catalog, [
  ...packageDefinitions,
  { ...packageDefinitions[0], id: 'go', name: 'Go 语言', accent: '#62607d' },
]);
const Path = () => <output data-testid="path">{useLocation().pathname}</output>;
const app = () => (
  <StrictMode>
    <MemoryRouter initialEntries={['/book']}>
      <Routes>
        <Route path="/book" element={<BookShelf books={books} />} />
        <Route path="/book/:id" element={<h1>书籍正文</h1>} />
      </Routes>
      <Path />
    </MemoryRouter>
  </StrictMode>
);

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('sky glass bookshelf', () => {
  it('returns a book with Escape, restores focus and releases the scroll lock', async () => {
    const user = userEvent.setup();
    render(app());
    const spine = screen.getByRole('link', { name: '抽出 算法学习手册，3 个章节' });
    await user.click(spine);
    expect(spine).toHaveAttribute('aria-expanded', 'true');
    const preview = screen.getByRole('dialog', { name: '算法学习手册封面特写' });
    const read = within(preview).getByRole('link', { name: '翻开 算法学习手册，开始阅读' });
    await waitFor(() => expect(read).toHaveFocus());
    expect(document.body.style.overflow).toBe('hidden');
    expect(hasOpenOverlay()).toBe(true);
    await user.tab({ shift: true });
    expect(within(preview).getByRole('button', { name: '放回书架' })).toHaveFocus();
    await user.tab({ shift: true });
    expect(read).toHaveFocus();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(spine).toHaveFocus());
    expect(spine).toHaveAttribute('aria-expanded', 'false');
    expect(hasOpenOverlay()).toBe(false);
    expect(document.body.style.overflow).not.toBe('hidden');
    expect(screen.getByTestId('path')).toHaveTextContent('/book');
    await user.click(screen.getByRole('link', { name: '抽出 Go 语言，3 个章节' }));
    expect(screen.getByRole('dialog', { name: 'Go 语言封面特写' })).toBeInTheDocument();
  });

  it('cancels a pending navigation when a book is put back during opening', () => {
    vi.useFakeTimers();
    render(app());
    fireEvent.click(screen.getByRole('link', { name: '抽出 算法学习手册，3 个章节' }));
    fireEvent.click(screen.getByRole('link', { name: '翻开 算法学习手册，开始阅读' }));
    expect(screen.getByText('正在翻开书本…')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '放回书架' }));
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '书籍正文' })).not.toBeInTheDocument();
    expect(screen.getByTestId('path')).toHaveTextContent('/book');
  });

  it('does not restart the opening animation after repeated clicks', () => {
    vi.useFakeTimers();
    render(app());
    fireEvent.click(screen.getByRole('link', { name: '抽出 算法学习手册，3 个章节' }));
    const read = screen.getByRole('link', { name: '翻开 算法学习手册，开始阅读' });
    fireEvent.click(read);
    act(() => vi.advanceTimersByTime(500));
    fireEvent.click(read);
    expect(read).toHaveAttribute('aria-disabled', 'true');
    act(() => vi.advanceTimersByTime(280));
    expect(screen.getByRole('heading', { name: '书籍正文' })).toBeInTheDocument();
    expect(screen.getByTestId('path')).toHaveTextContent('/book/algorithms');
    expect(hasOpenOverlay()).toBe(false);
  });

  it('dismisses the close-up by clicking the background', async () => {
    const user = userEvent.setup();
    const { container } = render(app());
    await user.click(screen.getByRole('link', { name: '抽出 算法学习手册，3 个章节' }));
    await user.click(document.querySelector('.book-focus-backdrop')!);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(container.querySelector('[data-selected]')).toBeNull();
  });

  it('preserves standard links for opening in another tab', () => {
    render(app());
    const spine = screen.getByRole('link', { name: '抽出 算法学习手册，3 个章节' });
    const event = new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true });
    fireEvent(spine, event);
    expect(event.defaultPrevented).toBe(false);
    expect(spine).toHaveAttribute('href', '/book/algorithms');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('skips animation delays with reduced motion and cleans up on unmount', async () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({
        matches: query === '(prefers-reduced-motion: reduce)',
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );
    const user = userEvent.setup();
    const { unmount } = render(app());
    const spine = screen.getByRole('link', { name: '抽出 算法学习手册，3 个章节' });
    await user.click(spine);
    await user.click(screen.getByRole('button', { name: '放回书架' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await user.click(spine);
    await user.click(screen.getByRole('link', { name: '翻开 算法学习手册，开始阅读' }));
    expect(screen.getByRole('heading', { name: '书籍正文' })).toBeInTheDocument();
    expect(hasOpenOverlay()).toBe(false);
    unmount();
    expect(document.body.style.overflow).not.toBe('hidden');
  });

  it('keeps all real books in order across multiple glass shelves', () => {
    const many = Array.from({ length: 17 }, (_, index) => ({
      ...books[0],
      id: `book-${index}`,
      name: `书籍 ${index}`,
    }));
    const { container } = render(
      <MemoryRouter>
        <BookShelf books={many} />
      </MemoryRouter>,
    );
    expect(container.querySelectorAll('.book-shelf-tier')).toHaveLength(3);
    expect(screen.getAllByRole('link').map((link) => link.getAttribute('href'))).toEqual(
      many.map((book) => `/book/${book.id}`),
    );
  });

  it('renders deterministic book spines and indexable links without an open modal in SSR', () => {
    const html = renderToString(app());
    expect(renderToString(app())).toBe(html);
    expect(html).toContain('href="/book/algorithms"');
    expect(html).toContain('算法学习手册');
    expect(html).toContain('book-glass-plank');
    expect(html).not.toContain('role="dialog"');
    expect(html).not.toContain('book-object-cover');
  });
});
