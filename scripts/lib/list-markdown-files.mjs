/**
 * 递归列出目录下全部 Markdown 文件。
 * 返回相对 dir 的 posix 路径（正斜杠），已排序，便于跨平台写入 filePath。
 */
import fs from 'node:fs';
import path from 'node:path';

/**
 * @param {string} dir 绝对或相对目录
 * @returns {string[]} 如 `a.md`、`nested/b.md`
 */
export const listMarkdownFiles = (dir) => {
  if (!fs.existsSync(dir)) return [];

  /** @type {string[]} */
  const results = [];

  const walk = (current) => {
    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        results.push(path.relative(dir, full).split(path.sep).join('/'));
      }
    }
  };

  walk(dir);
  return results.sort((a, b) => a.localeCompare(b));
};
