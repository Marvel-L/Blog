// @vitest-environment node
import { renderToStaticMarkup } from 'react-dom/server';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { RinArtwork } from './RinArtwork';

describe('RinArtwork', () => {
  it('人物关键区域完整实色，只有轮廓外透明，且不依赖抠图资源', async () => {
    const markup = renderToStaticMarkup(<RinArtwork />);
    expect(markup).not.toMatch(/<(?:img|image|mask)\b/);
    const { data, info } = await sharp(Buffer.from(markup))
      .resize(300, 500)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const alpha = (x: number, y: number) => data[(y * info.width + x) * info.channels + 3];
    // Bun, face, scarf, vest, each sleeve, skirt, each leg and each boot.
    for (const [x, y] of [
      [150, 40],
      [145, 150],
      [140, 200],
      [120, 245],
      [90, 272],
      [202, 272],
      [140, 320],
      [122, 377],
      [165, 377],
      [110, 448],
      [170, 448],
    ]) {
      expect(alpha(x, y), `人物坐标 ${x},${y} 不应透底`).toBe(255);
    }
    expect(alpha(20, 20)).toBe(0);
  });
});
