import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { Accumulate } from './Accumulate';

const { decks } = vi.hoisted(() => ({
  decks: [
    {
      id: 'quotes',
      title: '名人名言',
      items: [
        {
          id: 'q1',
          title: '第一句名言',
          content: '甲\n\n![配图](./pic.png)',
          filePath: '/Summary/名人名言/q1.md',
          author: '荀子',
        },
        { id: 'q2', title: '第二句名言', content: '乙', filePath: '/Summary/名人名言/q2.md' },
      ],
    },
    {
      id: 'todos',
      title: '代办',
      items: [
        { id: 't1', title: '先写笔记', content: '补进路线图', filePath: '/Summary/代办/t1.md', status: '进行中' },
        { id: 't2', title: '再读摘录', content: '', filePath: '/Summary/代办/t2.md' },
      ],
    },
  ],
}));

vi.mock('@/services/accumulate', async () => {
  const actual = await vi.importActual<typeof import('@/services/accumulate')>('@/services/accumulate');
  return {
    ...actual,
    getAccumulateDecks: () => decks,
  };
});

const renderPage = () =>
  render(
    <MemoryRouter>
      <Accumulate />
    </MemoryRouter>,
  );

describe('Accumulate', () => {
  it('默认展示第一个分类的第一张卡片', () => {
    renderPage();
    expect(screen.getByRole('heading', { name: '第一句名言' })).toBeInTheDocument();
    expect(screen.getByText('荀子')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: '当前内容' })).toHaveClass('overflow-y-auto');
    expect(screen.getByText(/1 \/ 2/)).toBeInTheDocument();
    const image = screen.getByRole('img', { name: '配图' });
    expect(image).toHaveClass('object-cover');
    expect(image).toHaveAttribute('width', '224');
    expect(image).toHaveAttribute('height', '224');
    expect(image.getAttribute('src')).toContain('/summary-img/');
  });

  it('左侧切换分类后展示该分类的卡片', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: /代办/ }));
    expect(screen.getByRole('heading', { name: '先写笔记' })).toBeInTheDocument();
    expect(screen.getByText('补进路线图')).toBeInTheDocument();
    expect(screen.getByText('进行中')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '第一句名言' })).not.toBeInTheDocument();
  });

  it('点击边缘查看下一项和上一项，并在末尾环绕', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: '右侧边缘，下一项' }));
    expect(screen.getByRole('heading', { name: '第二句名言' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '上方边缘，上一项' }));
    expect(screen.getByRole('heading', { name: '第一句名言' })).toBeInTheDocument();
    await user.keyboard('{ArrowLeft}');
    expect(screen.getByRole('heading', { name: '第二句名言' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '第一句名言' }));
    expect(screen.getByRole('heading', { name: '第一句名言' })).toBeInTheDocument();
    expect(screen.queryByText('进行中')).not.toBeInTheDocument();
  });
});
