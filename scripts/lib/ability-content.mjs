import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';
import { parseMarkdownImages } from '../post-content-validator.mjs';
import { siblingImageRelative } from '../../packages/blog/src/utils/post-image-src.mjs';
import {
  ABILITY_DIMENSIONS,
  validateAbilityConfig,
  abilityDocumentRoute,
} from '../../packages/blog/src/abilities/ability-core.mjs';
const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
export const ABILITY_ROOT = path.join(REPO_ROOT, 'about-radar');
function readRegular(filename, maxSize = 1024 * 1024) {
  const stat = fs.lstatSync(filename);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > maxSize)
    throw new Error(`能力文件不是普通文件或超过限制：${filename}`);
  return fs.readFileSync(filename, 'utf8');
}
/** 明确目录限定；不读 symlink，不把能力 Markdown 加入文章索引。 */
export function loadAbilityData(root = ABILITY_ROOT) {
  if (!fs.existsSync(root)) return { config: {}, documents: [] };
  if (fs.lstatSync(root).isSymbolicLink()) throw new Error('能力目录不能是符号链接');
  const configPath = path.join(root, 'config.json');
  const config = fs.existsSync(configPath) ? validateAbilityConfig(JSON.parse(readRegular(configPath, 100000))) : {};
  const documents = [];
  for (const { title: dimension } of ABILITY_DIMENSIONS) {
    const directory = path.join(root, dimension);
    if (!fs.existsSync(directory)) continue;
    const stat = fs.lstatSync(directory);
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error(`能力包不是普通目录：${dimension}`);
    const entries = fs.readdirSync(directory, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isSymbolicLink()) throw new Error(`能力包不支持符号链接：${dimension}/${entry.name}`);
    }
    const files = entries.filter((entry) => entry.isFile() && /\.md$/i.test(entry.name) && !entry.name.startsWith('.'));
    files.sort((a, b) => {
      if (a.name === b.name) return 0;
      if (a.name.toLowerCase() === 'index.md') return -1;
      if (b.name.toLowerCase() === 'index.md') return 1;
      return a.name.localeCompare(b.name, 'zh-CN', { numeric: true });
    });
    for (const file of files) {
      abilityDocumentRoute(dimension, file.name);
      const source = readRegular(path.join(directory, file.name));
      const parsed = matter(source);
      if (parsed.data.draft === true) continue;
      const content = parsed.content.trim();
      if (!content) throw new Error(`能力文档为空：${dimension}/${file.name}`);
      const heading = content.match(/^#\s+(.+)$/m)?.[1];
      const filePath = `/about-radar/${dimension}/${file.name}`;
      for (const image of parseMarkdownImages(content)) {
        const src = image.target;
        if (!src || /^[a-z][a-z\d+.-]*:/i.test(src) || src.startsWith('/')) continue;
        const relative = siblingImageRelative(filePath, src, {
          contentDir: 'about-radar',
          publicPrefix: '/about-radar-img',
        });
        if (!relative) throw new Error(`能力图片越界：${dimension}/${file.name}`);
        const parts = relative.split('/');
        let current = root;
        for (const part of parts) {
          current = path.join(current, part);
          if (fs.lstatSync(current).isSymbolicLink()) throw new Error('能力图片不能使用符号链接');
        }
        if (!fs.statSync(current).isFile()) throw new Error(`能力图片缺失：${src}`);
      }
      documents.push({
        dimension,
        filename: file.name,
        title: typeof parsed.data.title === 'string' ? parsed.data.title : heading || file.name,
        content,
        filePath,
      });
    }
  }
  return { config, documents };
}
export function copyAbilityImages(root = ABILITY_ROOT, output = path.join(REPO_ROOT, 'public/about-radar-img')) {
  if (!fs.existsSync(root)) return;
  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const filename = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`能力资源不支持符号链接：${filename}`);
      if (entry.isDirectory()) walk(filename);
      else if (entry.isFile() && /\.(png|jpe?g|webp|gif|avif|svg)$/i.test(entry.name)) {
        const destination = path.join(output, path.relative(root, filename));
        fs.mkdirSync(path.dirname(destination), { recursive: true });
        fs.copyFileSync(filename, destination);
      }
    }
  };
  walk(root);
}
export function writeAbilityData(data, output = path.join(REPO_ROOT, 'generated/abilities.json')) {
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(data, null, 2)}\n`);
}
