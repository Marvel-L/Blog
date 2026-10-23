import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PostCard } from './PostCard';
import { CompactPostCard } from './CompactPostCard';
import { KeywordHighlight } from './SearchMatchPreview';
import { splitSearchHighlight } from '@/utils/searchHighlight';
import type { PostSearchResult } from '@/services/posts';

describe('关键词高亮', () => {
  it('保留全角、大小写与补充平面字符，合并重叠词', () => {
    const text = '😀 Ｒｅａｃｔ 和 React.memo';
    const parts = splitSearchHighlight(text, ['react', 'react.memo']);
    expect(parts.map((part) => part.text).join('')).toBe(text);
    expect(parts.filter((part) => part.matched).map((part) => part.text)).toEqual(['Ｒｅａｃｔ', 'React.memo']);
    expect(splitSearchHighlight('链表', ['没有'])).toEqual([{ text: '链表', matched: false }]);
  });

  it('HTML 与正则特殊字符按普通文本展示', () => {
    const text = '<img src=x onerror=alert(1)> a+b';
    render(<KeywordHighlight text={text} terms={['a+b', '<img']} />);
    expect(document.body.textContent).toContain(text);
    expect(document.querySelector('img')).toBeNull();
    expect(Array.from(document.querySelectorAll('mark')).map((node) => node.textContent)).toEqual(['<img', 'a+b']);
  });
});

describe('搜索结果卡片', () => {
  const post: PostSearchResult = {
    id: 'reverse',
    title: '链表反转',
    excerpt: '普通摘要',
    category: '算法',
    date: '2026-01-01',
    tags: [],
    filePath: '/posts/reverse.md',
    readTime: '1 分钟',
    searchMatch: { field: 'content', label: '正文', snippet: '反转链表前保存 next 指针', terms: ['链表', 'next'] },
  };

  it.each(['desktop', 'mobile'])('%s 卡片展示命中片段与高亮并指向原文章', (variant) => {
    render(
      <MemoryRouter>
        {variant === 'desktop' ? (
          <PostCard post={post} searchMatch={post.searchMatch} onShare={() => {}} />
        ) : (
          <CompactPostCard post={post} searchMatch={post.searchMatch} />
        )}
      </MemoryRouter>,
    );
    expect(screen.getByText('正文命中')).toBeInTheDocument();
    expect(screen.queryByText('普通摘要')).not.toBeInTheDocument();
    expect(Array.from(document.querySelectorAll('mark')).map((node) => node.textContent)).toContain('next');
    expect(screen.getByRole('heading')).toHaveTextContent('链表反转');
    expect(document.querySelector('a')).toHaveAttribute('href', '/post/reverse');
  });
});
