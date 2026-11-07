// @vitest-environment node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const cwd = fileURLToPath(new URL('../', import.meta.url));
const eslint = new ESLint({ cwd });

describe('repository lint boundaries', () => {
  it('excludes distributed bundles while still checking authored prototype and product code', async () => {
    for (const file of [
      'article-revisit-prototype/_shared/js/mermaid.min.js',
      'article-revisit-prototype/assets/demo.js',
      'article-revisit-prototype/assets/demo-v2.js',
    ]) {
      expect(await eslint.isPathIgnored(path.join(cwd, file))).toBe(true);
    }
    for (const file of [
      'article-revisit-prototype/assets/plan.js',
      'planner-prototype/assets/demo.js',
      'packages/blog/src/pages/anki/AnkiDialogs.tsx',
    ]) {
      expect(await eslint.isPathIgnored(path.join(cwd, file))).toBe(false);
    }
  });

  it('checks authored prototype scripts using browser globals and still catches unknown names', async () => {
    const [valid] = await eslint.lintText('window.mermaid.initialize({ startOnLoad: true });', {
      filePath: 'article-revisit-prototype/assets/plan.js',
    });
    expect(valid.errorCount).toBe(0);
    const [result] = await eslint.lintText('window.document.title = missingTitle;', {
      filePath: 'article-revisit-prototype/assets/plan.js',
    });
    expect(result.messages.map(({ ruleId, message }) => ({ ruleId, message }))).toEqual([
      { ruleId: 'no-undef', message: "'missingTitle' is not defined." },
    ]);
  });

  it('retains Node globals and undefined browser checks for build scripts', async () => {
    const [result] = await eslint.lintText("process.exitCode = 0; document.title = 'browser';", {
      filePath: 'scripts/example.mjs',
    });
    expect(result.messages.map(({ ruleId, message }) => ({ ruleId, message }))).toEqual([
      { ruleId: 'no-undef', message: "'document' is not defined." },
    ]);
  });
});
