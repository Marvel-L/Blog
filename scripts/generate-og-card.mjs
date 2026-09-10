/**
 * 生成全站默认社交分享卡片（1200×630）。
 *
 * 若存在 public/logo.png，则生成「纸感渐变背景 + 居中 logo」的 og-card.png；
 * 若站点未配置 logo（文件不存在），则跳过生成并清理旧产物，不阻断构建。
 * 授权依据：用户要求删除站点品牌图并移除引用（2026-09-10）。
 */
import sharp from 'sharp';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PUBLIC_DIR = path.join(__dirname, '../public');
const LOGO_PATH = path.join(PUBLIC_DIR, 'logo.png');
const OUTPUT_PATH = path.join(PUBLIC_DIR, 'og-card.png');

// 与站内 .dark 主题下的纸张背景观感一致的暖纸渐变。
const CARD_BG_TOP = '#f2f0e9';
const CARD_BG_BOTTOM = '#e8e2d6';

// 视觉权重：卡片中 logo 的近似目标宽度（约 1/3 卡片宽度）。
const LOGO_TARGET_WIDTH = 400;

const removeStaleCard = () => {
  if (fs.existsSync(OUTPUT_PATH)) {
    fs.unlinkSync(OUTPUT_PATH);
    console.log(`[gen:og-card] removed stale ${path.relative(process.cwd(), OUTPUT_PATH)}`);
  }
};

const run = async () => {
  if (!fs.existsSync(LOGO_PATH)) {
    removeStaleCard();
    console.log('[gen:og-card] skipped: public/logo.png not found');
    return;
  }

  const logo = sharp(LOGO_PATH);
  const metadata = await logo.metadata();

  if (!metadata.width || !metadata.height) {
    throw new Error('generate-og-card: cannot read logo dimensions');
  }

  const aspectHeight = Math.round(LOGO_TARGET_WIDTH * (metadata.height / metadata.width));
  // 竖图 logo（高度远大于宽度）等比放大后可能超过卡片高度（630）：clamp 到
  // 卡片高度减安全边距，resize 的 fit:'contain' 会等比缩到盒内（不拉伸），
  // 避免 composite 的 top 为负（负坐标在 sharp 中行为未定义，可能报错或裁切）。
  const logoHeight = Math.min(aspectHeight, 630 - 96);

  // 生成品牌化分享卡片：logo 等比缩放为期望宽度（高度按原比例），
  // 叠加到纸张渐变背景中央，输出 1200×630 PNG。
  const svgBackground = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">`,
    `<defs>`,
    `<linearGradient id="paper" x1="0" y1="0" x2="0" y2="1">`,
    `<stop offset="0" stop-color="${CARD_BG_TOP}" />`,
    `<stop offset="1" stop-color="${CARD_BG_BOTTOM}" />`,
    `</linearGradient>`,
    `</defs>`,
    `<rect width="1200" height="630" fill="url(#paper)" />`,
    `</svg>`,
  ].join('');

  const cardBackground = sharp(Buffer.from(svgBackground)).png();
  const logoSquare = await logo
    .resize({
      width: LOGO_TARGET_WIDTH,
      height: logoHeight,
      fit: 'contain',
      position: 'centre',
      background: { r: 0xff, g: 0xff, b: 0xff, alpha: 0 },
    })
    .png()
    .toBuffer();

  await cardBackground
    .composite([
      {
        input: logoSquare,
        top: Math.round((630 - logoHeight) / 2),
        left: Math.round((1200 - LOGO_TARGET_WIDTH) / 2),
      },
    ])
    .png()
    .toFile(OUTPUT_PATH);

  const result = await sharp(OUTPUT_PATH).metadata();
  console.log(`[gen:og-card] generated ${path.relative(process.cwd(), OUTPUT_PATH)} ${result.width}x${result.height}`);
};

run().catch((error) => {
  console.error(`[gen:og-card] ${error.message}`);
  process.exitCode = 1;
});
