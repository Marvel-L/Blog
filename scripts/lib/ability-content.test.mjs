// @vitest-environment node
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { loadAbilityData, writeAbilityData } from './ability-content.mjs';
import { getAbilityRoutes } from '../../packages/blog/src/abilities/ability-core.mjs';
const directories = [];
const fixture = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ability-test-'));
  directories.push(root);
  return root;
};
afterEach(() => {
  for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});
describe('能力内容构建', () => {
  it('无配置为空数据，未把缺失当 N', () => {
    expect(loadAbilityData(fixture())).toEqual({ config: {}, documents: [] });
  });
  it('配置、自然顺序、草稿与 URL 编码保持一致', () => {
    const root = fixture();
    fs.writeFileSync(path.join(root, 'config.json'), JSON.stringify({ 算法: 'V' }));
    fs.mkdirSync(path.join(root, '算法'));
    for (const file of ['Stage10.md', 'Stage2.md', 'Index.md'])
      fs.writeFileSync(path.join(root, '算法', file), `# ${file}\n\n===高亮===`);
    fs.writeFileSync(path.join(root, '算法', 'Draft.md'), '---\ndraft: true\n---\n# 草稿');
    const data = loadAbilityData(root);
    expect(data.config).toEqual({ 算法: 'V' });
    expect(data.documents.map((d) => d.filename)).toEqual(['Index.md', 'Stage2.md', 'Stage10.md']);
    expect(getAbilityRoutes(data)[0]).toBe('about/ability/%E7%AE%97%E6%B3%95/Index.md');
    const output = path.join(root, 'out/data.json');
    writeAbilityData(data, output);
    expect(JSON.parse(fs.readFileSync(output, 'utf8'))).toEqual(data);
  });
  it('精简维度名称用于配置、同名目录与文档路由', () => {
    const root = fixture();
    const titles = ['业务广度', '业务深度', '技术广度', '技术深度'];
    const config = Object.fromEntries(titles.map((title) => [title, 'N']));
    fs.writeFileSync(path.join(root, 'config.json'), JSON.stringify(config));
    for (const title of titles) {
      fs.mkdirSync(path.join(root, title));
      fs.writeFileSync(path.join(root, title, 'Index.md'), `# ${title}\n\n说明`);
    }
    const data = loadAbilityData(root);
    expect(data.config).toEqual(config);
    expect(data.documents.map((document) => document.dimension)).toEqual(titles);
    expect(getAbilityRoutes(data)).toEqual(
      titles.map((title) => `about/ability/${encodeURIComponent(title)}/Index.md`),
    );
  });
  it('非法配置、空文档、symlink 阻断', () => {
    const root = fixture();
    fs.writeFileSync(path.join(root, 'config.json'), '{');
    expect(() => loadAbilityData(root)).toThrow();
    fs.writeFileSync(path.join(root, 'config.json'), '{}');
    fs.mkdirSync(path.join(root, '算法'));
    fs.writeFileSync(path.join(root, '算法', 'Index.md'), '');
    expect(() => loadAbilityData(root)).toThrow();
    fs.unlinkSync(path.join(root, '算法', 'Index.md'));
    fs.symlinkSync(path.join(root, 'config.json'), path.join(root, '算法', 'outside.md'));
    expect(() => loadAbilityData(root)).toThrow();
  });
  it('图片缺失和越界不静默接受', () => {
    const root = fixture();
    fs.mkdirSync(path.join(root, '算法'));
    fs.writeFileSync(path.join(root, '算法', 'Index.md'), '# 说明\n\n![图](missing.png)');
    expect(() => loadAbilityData(root)).toThrow();
    fs.writeFileSync(path.join(root, '算法', 'Index.md'), '# 说明\n\n![图](../../outside.png)');
    expect(() => loadAbilityData(root)).toThrow();
  });
});
