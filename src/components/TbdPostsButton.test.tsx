import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import type { PostMetadata } from '@/types';
import { TbdPostsButton } from './TbdPostsButton';

const makePost = (partial: Partial<PostMetadata> & Pick<PostMetadata, 'id' | 'title' | 'date' | 'category'>): PostMetadata => ({
  excerpt: '摘要',
  filePath: `/posts/${partial.id}.md`,
  readTime: '1 分钟',
  tags: [],
  ...partial,
});

let probePathname = '';
const LocationProbe = () => {
  probePathname = useLocation().pathname;
  return null;
};

describe('TbdPostsButton', () => {
  it('点击双感叹号后跳转到待补完页面', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route
            path="/"
            element={
              <>
                <TbdPostsButton
                  posts={[
                    makePost({ id: 'post-a', title: '待补完文章 A', date: '2026-10-01', category: '日常', tbd: true }),
                    makePost({ id: 'post-b', title: '正常文章 B', date: '2026-10-02', category: '技术' }),
                  ]}
                />
                <LocationProbe />
              </>
            }
          />
          <Route path="/tbd" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('link', { name: /查看待补完文章页/ }));

    expect(probePathname).toBe('/tbd');
  });

  it('根据待补完文章数量输出不同告警等级', () => {
    render(
      <MemoryRouter>
        <>
          <TbdPostsButton posts={[makePost({ id: 'post-c', title: '正常文章 C', date: '2026-10-03', category: '技术' })]} />
          <TbdPostsButton
            posts={[
              makePost({ id: 'post-d', title: '待补完 D', date: '2026-10-01', category: '技术', tbd: true }),
              makePost({ id: 'post-e', title: '待补完 E', date: '2026-10-02', category: '技术', tbd: true }),
              makePost({ id: 'post-f', title: '待补完 F', date: '2026-10-03', category: '技术', tbd: true }),
              makePost({ id: 'post-g', title: '待补完 G', date: '2026-10-04', category: '技术', tbd: true }),
              makePost({ id: 'post-h', title: '待补完 H', date: '2026-10-05', category: '技术', tbd: true }),
            ]}
          />
        </>
      </MemoryRouter>,
    );

    const links = screen.getAllByRole('link', { name: /查看待补完文章页/ });
    expect(links[0]).toHaveAttribute('data-alert-level', 'quiet');
    expect(links[1]).toHaveAttribute('data-alert-level', 'high');
  });
});
