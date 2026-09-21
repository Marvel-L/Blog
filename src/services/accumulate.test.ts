import { describe, expect, it } from 'vitest';
import {
  getAccumulateDecks,
  groupSummaryFiles,
  resolveCardSwipe,
  splitSummaryMarkdown,
  stepDeckIndex,
} from './accumulate';

describe('splitSummaryMarkdown', () => {
  it('文首标题单独取出，正文不再重复', () => {
    expect(splitSummaryMarkdown('# 不积跬步\n\n不积小流。\n', '01')).toEqual({
      title: '不积跬步',
      content: '不积小流。',
    });
  });

  it('没有标题时用去掉序号的文件名，正文保留', () => {
    expect(splitSummaryMarkdown('只有一段话。\n', '01-随记')).toEqual({
      title: '随记',
      content: '只有一段话。',
    });
  });

  it('--- 里的 status 和 author 有值才带上，正文不再重复这两项', () => {
    const raw = '---\nstatus: 进行中\nauthor: 荀子\n---\n\n# 不积跬步\n\n不积小流。\n';
    expect(splitSummaryMarkdown(raw, '01')).toEqual({
      title: '不积跬步',
      content: '不积小流。',
      status: '进行中',
      author: '荀子',
    });
  });

  it('没写的 label 不出现', () => {
    expect(splitSummaryMarkdown('---\nstatus:\n---\n\n# 事项\n', '01')).toEqual({
      title: '事项',
      content: '',
    });
  });
});

describe('groupSummaryFiles', () => {
  it('按 Summary 的一级子目录分类，并忽略更深或目录外的文件', () => {
    const decks = groupSummaryFiles([
      { path: '/repo/Summary/摘录/b.md', raw: '# 后记\n\n正文' },
      { path: '/repo/Summary/名人名言/a.md', raw: '# 名言\n\n出处' },
      { path: '/repo/Summary/代办/c.md', raw: '# 事项\n\n进行中' },
      { path: '/repo/Summary/杂项/z.md', raw: '# 其它' },
      { path: '/repo/Summary/名人名言/nested/skip.md', raw: '# 跳过' },
      { path: '/repo/posts/a.md', raw: '# 文章' },
    ]);

    expect(decks.map((deck) => deck.title)).toEqual(['名人名言', '代办', '摘录', '杂项']);
    expect(decks[0]?.items[0]).toMatchObject({
      title: '名言',
      content: '出处',
      filePath: '/Summary/名人名言/a.md',
    });
  });
});

describe('getAccumulateDecks', () => {
  it('读出 Summary 子目录里的 Markdown，并带上写了的 label', () => {
    const decks = getAccumulateDecks();
    expect(decks.map((deck) => deck.title)).toEqual(['代办', '网络热语']);
    expect(decks[0]?.items[0]).toMatchObject({
      title: '把 Channel 的笔记补进 Road',
      status: '进行中',
    });
    expect(decks[0]?.items[0]?.content).not.toContain('进行中');
    expect(decks[0]?.items[1]?.status).toBeUndefined();
    expect(decks[0]?.items[1]?.author).toBeUndefined();
  });
});

describe('stepDeckIndex', () => {
  it('向前向后都在序列内环绕', () => {
    expect(stepDeckIndex(0, 1, 3)).toBe(1);
    expect(stepDeckIndex(2, 1, 3)).toBe(0);
    expect(stepDeckIndex(0, -1, 3)).toBe(2);
  });

  it('空序列停在 0', () => {
    expect(stepDeckIndex(4, 1, 0)).toBe(0);
  });
});

describe('resolveCardSwipe', () => {
  it('未超过阈值时不翻页', () => {
    expect(resolveCardSwipe(10, -12)).toBeNull();
  });

  it('左右为水平翻页，上下为垂直翻页', () => {
    expect(resolveCardSwipe(-80, 10)).toEqual({ delta: 1, axis: 'x' });
    expect(resolveCardSwipe(80, 10)).toEqual({ delta: -1, axis: 'x' });
    expect(resolveCardSwipe(10, -80)).toEqual({ delta: 1, axis: 'y' });
    expect(resolveCardSwipe(10, 80)).toEqual({ delta: -1, axis: 'y' });
  });
});
