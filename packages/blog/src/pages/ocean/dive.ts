/** 深度为场景叙事刻度，不代表真实潜水数据。 */
export const DIVE_DURATION = 72;
export const MAX_DEPTH = 1200;
export const clamp = (value: number, min = 0, max = 1) => Math.max(min, Math.min(max, value));
export const depthAtTime = (time: number) => MAX_DEPTH * (1 - (1 - clamp(time / DIVE_DURATION)) ** 1.6);
export const timeAtDepth = (depth: number) => DIVE_DURATION * (1 - (1 - clamp(depth / MAX_DEPTH)) ** (1 / 1.6));

export const getOceanZone = (depth: number) => {
  if (depth < 120) return { name: '坠入蔚蓝', thought: '把喧嚣，留在海面。', index: 0 };
  if (depth < 450) return { name: '光的尽头', thought: '让所有念头，慢慢失重。', index: 1 };
  if (depth < 950) return { name: '静默深海', thought: '有些光，只在深处亮起。', index: 2 };
  return { name: '深蓝之境', thought: '此刻，只需要漂浮。', index: 3 };
};
