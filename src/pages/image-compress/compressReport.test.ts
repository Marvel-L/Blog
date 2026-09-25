import { describe, expect, it } from 'vitest';
import { getCompressedFilename, formatByteSize } from './compressImage';
import { sortCompressReportItems, truncateCompressReportItems } from './compressReport';

describe('compressImage helpers', () => {
  it('生成压缩文件名', () => {
    expect(getCompressedFilename('photo.PNG', 'jpeg')).toBe('photo-compressed.jpg');
    expect(getCompressedFilename('a/b:c.png', 'png')).toBe('a-b-c-compressed.png');
  });

  it('格式化体积', () => {
    expect(formatByteSize(800)).toBe('800 B');
    expect(formatByteSize(2048)).toBe('2.0 KB');
  });
});

describe('compressReport', () => {
  it('按节省体积降序', () => {
    const sorted = sortCompressReportItems([
      { article: 'A', image: 'a.jpg', path: 'a', originalBytes: 100, bytes: 90, savedBytes: 10 },
      { article: 'B', image: 'b.jpg', path: 'b', originalBytes: 200, bytes: 50, savedBytes: 150 },
    ]);
    expect(sorted.map((item) => item.path)).toEqual(['b', 'a']);
  });

  it('超出条数时省略', () => {
    const items = Array.from({ length: 5 }, (_, index) => ({ id: index }));
    expect(truncateCompressReportItems(items, 3)).toEqual({
      visible: items.slice(0, 3),
      omitted: 2,
      hasMore: true,
    });
  });
});
