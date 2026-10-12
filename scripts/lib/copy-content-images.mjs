import fs from 'node:fs';
import path from 'node:path';

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif', '.svg']);

/**
 * 递归复制内容图片到目标目录，保留源目录相对路径。
 * 用于发布时把内容图片同步到 public/*-img，避免页面引用存在但产物缺文件。
 */
export const copyContentImages = (sourceDir, destRoot) => {
  if (!fs.existsSync(sourceDir)) {
    return 0;
  }

  let count = 0;
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
        continue;
      }

      const dest = path.join(destRoot, path.relative(sourceDir, full));
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      if (fs.existsSync(dest)) {
        try {
          fs.chmodSync(dest, 0o644);
        } catch {
          // ignore readonly leftovers from previous builds
        }
      }
      fs.copyFileSync(full, dest);
      count += 1;
    }
  };

  walk(sourceDir);
  return count;
};
