import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { NodeArticlesModal } from './NodeArticlesModal';

describe('NodeArticlesModal', () => {
  it('标签和分类都省略时，展示按节点名补上的相关文章', () => {
    render(
      <MemoryRouter>
        <NodeArticlesModal node={{ id: '工作', title: '工作' }} onClose={() => {}} />
      </MemoryRouter>,
    );

    const associations = screen.getByRole('list', { name: '关联标签与分类' });
    expect(associations).toHaveTextContent('#工作');
    expect(associations).toHaveTextContent('求职心得');
    expect(associations).toHaveTextContent('重要决策');
    expect(screen.getByRole('heading', { name: '三本社招6年Go后端' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '北京工作切换' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '他们都去了哪里呢' })).not.toBeInTheDocument();
  });
});
