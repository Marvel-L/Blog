import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { PostMetadata } from '@/types';
import { TbdPostsButton } from './TbdPostsButton';

const makePost = (partial: Partial<PostMetadata> & Pick<PostMetadata, 'id' | 'title' | 'date' | 'category'>): PostMetadata => ({
  excerpt: '摘要',
  filePath: `/posts/${partial.id}.md`,
  readTime: '1 分钟',
  tags: [],
  ...partial,
});

describe('TbdPostsButton', () => {
  it('点击感叹号后只展示 tbd=true 的文章', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <TbdPostsButton
          posts={[
            makePost({ id: 'post-a', title: '待补完文章 A', date: '2026-10-01', category: '日常', tbd: true }),
            makePost({ id: 'post-b', title: '正常文章 B', date: '2026-10-02', category: '技术' }),
          ]}
        />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: /查看待补完文章/ }));

    expect(screen.getByRole('dialog', { name: '待补完文章' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /待补完文章 A/ })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /正常文章 B/ })).not.toBeInTheDocument();
  });

  it('没有 tbd 文章时展示空态提示', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <TbdPostsButton posts={[makePost({ id: 'post-c', title: '正常文章 C', date: '2026-10-03', category: '技术' })]} />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: /查看待补完文章/ }));

    expect(screen.getByText('当前没有待补完文章')).toBeInTheDocument();
  });
});
