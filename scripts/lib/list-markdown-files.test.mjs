// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { listMarkdownFiles } from './list-markdown-files.mjs';

describe('listMarkdownFiles', () => {
  /** @type {string} */
  let tmp;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'list-md-'));
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('递归收集嵌套 .md，跳过隐藏项与非 md', () => {
    fs.mkdirSync(path.join(tmp, 'nested'), { recursive: true });
    fs.mkdirSync(path.join(tmp, '.hidden'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'root.md'), '# root');
    fs.writeFileSync(path.join(tmp, 'nested', 'child.md'), '# child');
    fs.writeFileSync(path.join(tmp, 'nested', 'skip.txt'), 'nope');
    fs.writeFileSync(path.join(tmp, '.hidden', 'secret.md'), '# secret');

    expect(listMarkdownFiles(tmp)).toEqual(['nested/child.md', 'root.md']);
  });

  it('目录不存在时返回空数组', () => {
    expect(listMarkdownFiles(path.join(tmp, 'missing'))).toEqual([]);
  });
});
