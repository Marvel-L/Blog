import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { NodeArticlesModal } from './NodeArticlesModal';

vi.mock('@/services/posts', () => ({
  getInitialPosts: () => [
    {
      id: 'job',
      title: '求职样例',
      date: '2026-01-02',
      tags: ['工作'],
      category: '求职心得',
      excerpt: '',
      filePath: '',
      readTime: '1 分钟',
    },
    {
      id: 'other',
      title: '其它样例',
      date: '2026-01-01',
      tags: ['生活'],
      category: '随笔',
      excerpt: '',
      filePath: '',
      readTime: '1 分钟',
    },
  ],
}));

describe('NodeArticlesModal', () => {
  it('未显式配置关联时展示空状态，不按节点名推断文章', () => {
    render(
      <MemoryRouter>
        <NodeArticlesModal node={{ id: '工作', title: '工作' }} onClose={() => {}} />
      </MemoryRouter>,
    );
    expect(screen.queryByRole('list', { name: '关联标签与分类' })).not.toBeInTheDocument();
    expect(screen.getByText('暂无关联文章')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '求职样例' })).not.toBeInTheDocument();
  });

  it('展示显式标签关联的文章，不依赖真实博客内容', () => {
    render(
      <MemoryRouter>
        <NodeArticlesModal node={{ id: '工作', title: '工作', tags: ['工作'] }} onClose={() => {}} />
      </MemoryRouter>,
    );
    expect(screen.getByRole('list', { name: '关联标签与分类' })).toHaveTextContent('#工作');
    expect(screen.getByRole('heading', { name: '求职样例' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '其它样例' })).not.toBeInTheDocument();
  });
});
