// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { flattenSuspenseBoundaries, getAnkiStaticPages, runSsg } from './ssg.mjs';

describe('Anki cloud 静态入口', () => {
  it('仅 cloud 生成学习页和登录页，不把云端入口放进 Pages', () => {
    expect(getAnkiStaticPages('cloud').map((page) => page.path)).toEqual(['anki', 'anki/login']);
    expect(getAnkiStaticPages('pages')).toEqual([]);
    expect(getAnkiStaticPages(undefined)).toEqual([]);
  });

  it('真实 SSG 落盘专属壳与白底样式，首页不带 Anki 覆盖', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'dblog-anki-ssg-'));
    const oldTarget = process.env.VITE_DEPLOY_TARGET;
    try {
      process.env.VITE_DEPLOY_TARGET = 'cloud';
      const distDir = path.join(directory, 'dist');
      const ssrDir = path.join(directory, 'ssr');
      await mkdir(distDir);
      await mkdir(ssrDir);
      await writeFile(path.join(directory, 'package.json'), '{"type":"module"}');
      await writeFile(
        path.join(distDir, 'index.html'),
        '<html><head><title>Blog</title></head><body><div id="root"></div></body></html>',
      );
      await writeFile(
        path.join(ssrDir, 'entry-server.js'),
        `
        export async function renderApp(url) {
          const anki = url === '/anki' || url === '/anki/login';
          return {
            html: anki ? '<div class="anki-surface">正在加载卡片库…</div>' : '<div class="site-shell">Blog</div>',
            head: anki ? '<title>Anki 记忆卡片</title><meta name="robots" content="noindex"/>' : '<title>Blog</title>',
          };
        }
      `,
      );
      expect(await runSsg({ distDir, ssrDir })).toBe(true);
      for (const page of ['anki', 'anki/login']) {
        const html = await readFile(path.join(distDir, page, 'index.html'), 'utf8');
        expect(html).toContain('class="anki-surface"');
        expect(html).toContain('id="anki-boot-style"');
        expect(html).toContain('background: #fff !important');
        expect(html).toContain("html[data-love-mode-boot='true']:has(.anki-surface) #root { opacity: 1; }");
        expect(html).not.toContain('class="site-shell"');
        expect(html).toContain('noindex');
      }
      const home = await readFile(path.join(distDir, 'index.html'), 'utf8');
      expect(home).toContain('class="site-shell"');
      expect(home).not.toContain('anki-boot-style');
    } finally {
      if (oldTarget === undefined) delete process.env.VITE_DEPLOY_TARGET;
      else process.env.VITE_DEPLOY_TARGET = oldTarget;
      await rm(directory, { recursive: true, force: true });
    }
  });
});

/**
 * 构造 React 19 Fizz 输出的 Suspense 序列化片段。
 * 真实格式（文档序：fallback 最左 → hidden div 居中 → script 最右）：
 *   <!--$?--><template id="B:x">fallback</template><!--/$-->
 *   <div hidden id="S:x">真实内容</div>
 *   <script>$RC=function(b,c){};$RC("B:x","S:x")</script>
 */
const buildHtml = ({ rcCalls = [['B:0', 'S:0']], literalScriptContent = '', includeAllBoundaries = false } = {}) => {
  const allBoundaries = [
    { boundaryId: 'B:0', hiddenId: 'S:0', fallback: 'fallback-outer', content: 'outer-hidden-content' },
    { boundaryId: 'B:1', hiddenId: 'S:1', fallback: 'fallback-inner', content: 'inner-hidden-content' },
  ];
  const boundaries = includeAllBoundaries ? allBoundaries : allBoundaries.slice(0, rcCalls.length);
  const markers = boundaries
    .map(
      (b) =>
        `<!--$?--><template id="${b.boundaryId}">${b.fallback}</template><!--/$-->\n` +
        `<div hidden id="${b.hiddenId}">${b.content}</div>`,
    )
    .join('\n');
  const calls = rcCalls.map(([boundaryId, hiddenId]) => `$RC("${boundaryId}","${hiddenId}")`).join(';');
  return `<html><body><div id="root">\n${markers}\n<script>$RC=function(b,c){};${calls}${literalScriptContent}</script>\n</div></body></html>`;
};

describe('flattenSuspenseBoundaries', () => {
  it('单个 $RC 调用：把 hidden 内容搬到 fallback 位置并清理标记', () => {
    const html = buildHtml({ rcCalls: [['B:0', 'S:0']] });
    const result = flattenSuspenseBoundaries(html);

    expect(result).toContain('<!--$-->outer-hidden-content<!--/$-->');
    expect(result).not.toContain('<!--$?-->');
    expect(result).not.toContain('<template id="B:');
    expect(result).not.toContain('hidden id="S:0"');
    expect(result).not.toContain('$RC("B:0"');
    // script 内的函数定义保留（仅摘除调用文本）。
    expect(result).toContain('$RC=function');
  });

  it('同一 script 内多个 $RC 调用：逐个展平（回归：整段删除 script 只展平首个边界）', () => {
    const html = buildHtml({
      rcCalls: [
        ['B:0', 'S:0'],
        ['B:1', 'S:1'],
      ],
    });
    const result = flattenSuspenseBoundaries(html);

    expect(result).toContain('<!--$-->outer-hidden-content<!--/$-->');
    expect(result).toContain('<!--$-->inner-hidden-content<!--/$-->');
    expect(result).not.toContain('$RC("B:0"');
    expect(result).not.toContain('$RC("B:1"');
    expect(result).not.toContain('hidden id="S:');
    expect(result).not.toContain('<!--$?-->');
    expect(result).not.toContain('<template id="B:');
  });

  it('嵌套边界（B:0 外层先出现）：全部展平且无残留', () => {
    const html = buildHtml({
      rcCalls: [
        ['B:0', 'S:0'],
        ['B:1', 'S:1'],
      ],
    });
    const result = flattenSuspenseBoundaries(html);
    // 展平后的 <!--$-->...<!--/$--> 包装本身含 <!--/$-->，因此只断言
    // 无残留的 <!--$?--> 模板占位与 hidden div。
    expect(result).not.toContain('<!--$?-->');
    expect(result).not.toContain('<template id="B:');
    expect(result).not.toContain('hidden id="S:');
  });

  it('真正嵌套的边界（内层 hidden div 在外层 hidden div 内）：逐层展平无残留', () => {
    // 此前「嵌套边界」用例的 fixture 与多 $RC 用例完全相同（B:0/B:1 是兄弟节点），
    // 从未真正覆盖嵌套场景。真实嵌套：内层边界整体位于外层 hidden div 内。
    const html =
      '<html><body><div id="root">' +
      '<!--$?--><template id="B:0">fallback-outer</template><!--/$-->' +
      '<div hidden id="S:0">' +
      'outer-content ' +
      '<!--$?--><template id="B:1">fallback-inner</template><!--/$-->' +
      '<div hidden id="S:1">inner-content</div>' +
      '<script>$RC=function(b,c){};$RC("B:1","S:1")</script>' +
      '</div>' +
      '<script>$RC=function(b,c){};$RC("B:0","S:0")</script>' +
      '</div></body></html>';
    const result = flattenSuspenseBoundaries(html);
    expect(result).toContain('<!--$-->inner-content<!--/$-->');
    expect(result).toContain('outer-content');
    expect(result).not.toContain('<!--$?-->');
    expect(result).not.toContain('hidden id="S:');
    expect(result).not.toContain('<template id="B:');
    expect(result).not.toContain('$RC("B:');
  });

  it('正文中的字面量 $RC 文本不被误展平（只在 script 区域内扫描）', () => {
    const html =
      '<html><body><div id="root">' +
      '<p>讲解 React 水合的代码示例：$RC("B:x","S:x") 是序列化恢复调用。</p>' +
      '<script>window.__APP__ = 1;</script>' +
      '</div></body></html>';
    const result = flattenSuspenseBoundaries(html);
    // 字面量保留，script 保留，无任何改动。
    expect(result).toBe(html);
  });

  it('畸形输出（缺 hidden div）：走防御路径只摘除调用文本，不产生死循环', () => {
    const html =
      '<html><body><div id="root">' +
      '<!--$?--><template id="B:0">fallback</template><!--/$-->' +
      '<script>$RC=function(b,c){};$RC("B:0","S:0")</script>' +
      '</div></body></html>';
    const result = flattenSuspenseBoundaries(html);
    // hidden div 不存在 → 防御路径：仅移除 $RC 调用文本，其余标记保留。
    expect(result).not.toContain('$RC("B:0","S:0")');
    expect(result).toContain('<template id="B:0">');
    expect(result).toContain('<!--$?-->');
  });
});
