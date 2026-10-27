import { render, screen, fireEvent } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AnkiBrowse } from './AnkiBrowse';

const cards = [0, 1, 2].map((index) => ({
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
}));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('沉浸式随机浏览', () => {
  it('前后方向翻动、重复切换可重新触发、重洗归首卡并隐藏答案，全程只读', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.999);
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ cards })));
    vi.stubGlobal('fetch', fetcher);
    const { container } = render(<AnkiBrowse deckId="deck" deckName="学习库" onExit={vi.fn()} />);
    await screen.findByText('问题0');
    const stack = () => container.querySelector('.anki-browse-stack');
    expect(screen.getByRole('article', { name: '当前卡牌' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '上一张' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '显示答案' }));
    expect(screen.getByText('答案0')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '下一张' }));
    expect(screen.getByText('问题1')).toBeInTheDocument();
    expect(screen.queryByText('答案0')).not.toBeInTheDocument();
    expect(stack()).toHaveAttribute('data-motion', 'next');
    const previousStack = stack();
    fireEvent.click(screen.getByRole('button', { name: '下一张' }));
    expect(stack()).not.toBe(previousStack);
    expect(screen.getByText('问题2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '下一张' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '上一张' }));
    expect(stack()).toHaveAttribute('data-motion', 'previous');
    expect(screen.getByText('问题1')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '显示答案' }));
    fireEvent.click(screen.getByRole('button', { name: '重新洗牌' }));
    expect(stack()).toHaveAttribute('data-motion', 'shuffle');
    expect(screen.getByText('问题0')).toBeInTheDocument();
    expect(screen.queryByText('答案1')).not.toBeInTheDocument();
    expect(screen.getByText(/随机浏览 · 1 \/ 3/)).toBeInTheDocument();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls.every(([, init]) => !init?.method || init.method === 'GET')).toBe(true);
  });

  it('单卡也可重洗，首尾按钮禁用，返回路径可用', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ cards: cards.slice(0, 1) }))));
    const exit = vi.fn();
    render(<AnkiBrowse deckId="deck" deckName="学习库" onExit={exit} />);
    await screen.findByText('问题0');
    fireEvent.click(screen.getByRole('button', { name: '显示答案' }));
    fireEvent.click(screen.getByRole('button', { name: '重新洗牌' }));
    expect(screen.queryByText('答案0')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '上一张' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '下一张' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '返回卡片库' }));
    expect(exit).toHaveBeenCalledTimes(1);
  });
});
