// @vitest-environment node
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { loadConfigFromFile } from 'vite';
import yaml from 'js-yaml';
import { describe, expect, it, vi } from 'vitest';
import { buildTargetSettings } from './build-target.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const frontend = path.join(root, 'packages/blog');

describe('frontend workspace and deployment path contracts', () => {
  it('selects capabilities without discarding root env-file settings or shell overrides', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'dblog-env-contract-'));
    try {
      vi.stubEnv('VITE_BASE_PATH', undefined);
      vi.stubEnv('VITE_SITE_URL', undefined);
      await writeFile(
        path.join(directory, '.env.production'),
        'VITE_BASE_PATH=/custom/\nVITE_SITE_URL=https://example.com/custom\nVITE_DEPLOY_TARGET=cloud\n',
      );
      expect(buildTargetSettings('pages', directory)).toEqual({
        VITE_BASE_PATH: '/custom/',
        VITE_SITE_URL: 'https://example.com/custom',
        VITE_DEPLOY_TARGET: 'pages',
      });
      vi.stubEnv('VITE_BASE_PATH', '/shell/');
      expect(buildTargetSettings('cloud', directory).VITE_BASE_PATH).toBe('/shell/');
      expect(() => buildTargetSettings('invalid', directory)).toThrow('pages 或 cloud');
    } finally {
      vi.unstubAllEnvs();
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('forwards root CLI flags through npm to the actual frontend command', async () => {
    const { stdout, stderr } = await promisify(execFile)('npm', ['run', 'preview', '--', '--help'], {
      cwd: root,
      timeout: 10000,
    });
    expect(stdout).toContain('--strictPort');
    expect(stdout).toContain('vite preview --help');
    expect(stderr).not.toContain('Unknown cli config');
  });

  it('resolves the same client entry, assets and output through both CLI entry points', async () => {
    for (const [file, cwd] of [
      ['vite.config.ts', root],
      ['packages/blog/vite.config.ts', frontend],
    ]) {
      const loaded = await loadConfigFromFile({ command: 'build', mode: 'production' }, path.join(root, file), cwd);
      expect(loaded.config.root).toBe(frontend);
      expect(loaded.config.envDir).toBe(path.resolve(root));
      expect(loaded.config.publicDir).toBe(path.join(root, 'public'));
      expect(loaded.config.build.outDir).toBe(path.join(root, 'dist'));
      expect(loaded.config.resolve.alias['@']).toBe(path.join(frontend, 'src'));
      expect(loaded.config.resolve.alias['@config']).toBe(path.join(root, 'config'));
    }
  });

  it('keeps SSR output at the path consumed by the common SSG pipeline', async () => {
    const loaded = await loadConfigFromFile(
      { command: 'build', mode: 'production' },
      path.join(frontend, 'vite.ssr.config.ts'),
      frontend,
    );
    expect(loaded.config.build.outDir).toBe(path.join(root, 'dist-ssr'));
    expect(loaded.config.build.ssr).toBe(path.join(frontend, 'src/ssr-entry.tsx'));
  });

  it('uses the same cloud target in client and SSR while proxying only cloud API requests', async () => {
    const client = await loadConfigFromFile(
      { command: 'serve', mode: 'cloud' },
      path.join(frontend, 'vite.config.ts'),
      frontend,
    );
    const server = await loadConfigFromFile(
      { command: 'build', mode: 'cloud' },
      path.join(frontend, 'vite.ssr.config.ts'),
      frontend,
    );
    expect(client.config.define['import.meta.env.VITE_DEPLOY_TARGET']).toBe('"cloud"');
    expect(server.config.define['import.meta.env.VITE_DEPLOY_TARGET']).toBe('"cloud"');
    expect(client.config.server.proxy['/api/']).toBe('http://127.0.0.1:3001');
  });

  it('Anki 精确刷新入口使用专属 HTML，不重定向或回退博客首页', async () => {
    const config = await readFile(path.join(root, 'deploy/cloud/nginx.conf'), 'utf8');
    for (const route of ['anki', 'anki/login']) {
      const block = config.split(`location = /Blog/${route} {`)[1]?.split('}')[0];
      expect(block).toBeDefined();
      expect(block).toContain(`try_files /Blog/${route}/index.html =404;`);
      expect(block).not.toContain('return 30');
      expect(block).not.toContain('/Blog/index.html');
    }
    expect(config).toContain('try_files $uri $uri/ /Blog/index.html;');
  });

  it('keeps existing CMS content and site configuration at their published editing paths', async () => {
    const cms = yaml.load(await readFile(path.join(root, '.pages.yml'), 'utf8'));
    const posts = cms.content.find((collection) => collection.name === 'posts');
    const shuoshuo = cms.content.find((collection) => collection.name === 'shuoshuo');
    expect(posts.path).toBe('posts');
    expect(shuoshuo.path).toBe('shuoshuo');
    const siteConfig = cms.content.find((collection) => collection.name === 'siteConfig');
    expect(siteConfig.path).toBe('config/site.config.json');
    expect(JSON.parse(await readFile(path.join(root, siteConfig.path), 'utf8')).url).toMatch(/^https:\/\//);
  });
});
