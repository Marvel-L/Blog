/**
 * 积累页数据：只读 Summary/<分类>/*.md。
 * 子目录名即左侧分类，每个 Markdown 是一条可翻阅的内容。
 */
import { stripFrontmatter } from '@/utils/markdown-core.mjs';

export type CardAxis = 'x' | 'y';

export interface CardStep {
  delta: 1 | -1;
  axis: CardAxis;
}

export interface AccumulateItem {
  id: string;
  title: string;
  /** 去掉标题行之后的 Markdown 正文。 */
  content: string;
  /** 站点路径，如 /Summary/名人名言/01-不积跬步.md，供旁路图片改写。 */
  filePath: string;
  /** 文首 --- 中的 status；未写则不展示。 */
  status?: string;
  /** 文首 --- 中的 author；未写则不展示。 */
  author?: string;
}

export interface AccumulateDeck {
  id: string;
  title: string;
  items: AccumulateItem[];
}

const SWIPE_THRESHOLD_PX = 48;

/** 已知分类的展示顺序；其余子目录按中文排序接在后面。 */
const CATEGORY_ORDER = ['名人名言', '代办', '摘录'];

const summaryModules = import.meta.glob('../../Summary/*/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
});

const SUMMARY_FILE = /(?:^|\/)Summary\/([^/]+)\/([^/]+)\.md$/;
const FRONTMATTER_BLOCK = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

const readScalar = (block: string, key: string): string | undefined => {
  const line = block.split(/\r?\n/).find((entry) => entry.startsWith(`${key}:`));
  if (!line) {
    return undefined;
  }
  const value = line
    .slice(key.length + 1)
    .trim()
    .replace(/^['"]|['"]$/g, '');
  return value || undefined;
};

/** 只认文首 --- 里的 status 与 author。空值视为没写。 */
export const readSummaryLabels = (raw: string): { status?: string; author?: string } => {
  const match = raw.replace(/^\uFEFF/, '').match(FRONTMATTER_BLOCK);
  if (!match) {
    return {};
  }
  const status = readScalar(match[1], 'status');
  const author = readScalar(match[1], 'author');
  return {
    ...(status ? { status } : {}),
    ...(author ? { author } : {}),
  };
};

const displayFilename = (filename: string) => filename.replace(/^\d+-/, '').trim() || filename.trim();

/** 标题取文首 # 标题，否则用文件名；标题行不重复进正文。 */
export const splitSummaryMarkdown = (
  raw: string,
  filename: string,
): { title: string; content: string; status?: string; author?: string } => {
  const labels = readSummaryLabels(raw);
  const body = stripFrontmatter(raw)
    .replace(/^\uFEFF/, '')
    .trim();
  const heading = body.match(/^#\s+(.+?)\s*$/m);
  if (heading && body.startsWith('#')) {
    return {
      title: heading[1].trim(),
      content: body.replace(/^#\s+.+\s*(?:\r?\n)?/, '').trim(),
      ...labels,
    };
  }
  return { title: displayFilename(filename), content: body, ...labels };
};

export const groupSummaryFiles = (files: Array<{ path: string; raw: string }>): AccumulateDeck[] => {
  const byCategory = new Map<string, AccumulateItem[]>();

  for (const file of files) {
    const normalized = file.path.replace(/\\/g, '/');
    const match = normalized.match(SUMMARY_FILE);
    if (!match) {
      continue;
    }
    const category = match[1];
    const filename = match[2];
    if (!category || category.startsWith('.') || !filename || filename.startsWith('.')) {
      continue;
    }
    const { title, content, status, author } = splitSummaryMarkdown(file.raw, filename);
    if (!title && !content) {
      continue;
    }
    const items = byCategory.get(category) ?? [];
    items.push({
      id: `${category}/${filename}`,
      title: title || filename,
      content,
      filePath: `/Summary/${category}/${filename}.md`,
      ...(status ? { status } : {}),
      ...(author ? { author } : {}),
    });
    byCategory.set(category, items);
  }

  for (const items of byCategory.values()) {
    items.sort((a, b) => a.filePath.localeCompare(b.filePath, 'zh'));
  }

  return [...byCategory.keys()]
    .sort((a, b) => {
      const aIndex = CATEGORY_ORDER.indexOf(a);
      const bIndex = CATEGORY_ORDER.indexOf(b);
      if (aIndex === -1 && bIndex === -1) {
        return a.localeCompare(b, 'zh');
      }
      if (aIndex === -1) {
        return 1;
      }
      if (bIndex === -1) {
        return -1;
      }
      return aIndex - bIndex;
    })
    .map((name) => ({
      id: name,
      title: name,
      items: byCategory.get(name) ?? [],
    }));
};

export const getAccumulateDecks = (): AccumulateDeck[] =>
  groupSummaryFiles(Object.entries(summaryModules).map(([path, raw]) => ({ path, raw: String(raw) })));

/** 在环形卡片序列中前进或后退；空序列停在 0。 */
export const stepDeckIndex = (current: number, delta: number, length: number): number => {
  if (length <= 0) {
    return 0;
  }
  return (((current + delta) % length) + length) % length;
};

/**
 * 滑动超过阈值则翻页：向左/向上为下一条，向右/向下为上一条。
 * 斜向滑动取位移更大的轴。
 */
export const resolveCardSwipe = (dx: number, dy: number, threshold = SWIPE_THRESHOLD_PX): CardStep | null => {
  if (Math.abs(dx) < threshold && Math.abs(dy) < threshold) {
    return null;
  }
  if (Math.abs(dx) >= Math.abs(dy)) {
    return { delta: dx < 0 ? 1 : -1, axis: 'x' };
  }
  return { delta: dy < 0 ? 1 : -1, axis: 'y' };
};
