/**
 * 氛围粒子特效：类型、文案与本地持久化键。
 * 主题（浅色/深色）与特效相互独立，共 2×4 种组合。
 */

export const PARTICLE_EFFECT_STORAGE_KEY = 'particle-effect';

export const PARTICLE_EFFECT_IDS = ['rain', 'heavy-rain', 'sakura', 'fireflies'] as const;

export type ParticleEffectId = (typeof PARTICLE_EFFECT_IDS)[number];

export const PARTICLE_EFFECT_OPTIONS: ReadonlyArray<{
  id: ParticleEffectId;
  label: string;
  hint: string;
}> = [
  { id: 'rain', label: '小雨', hint: '细雨斜落' },
  { id: 'heavy-rain', label: '大雨', hint: '密集雨幕' },
  { id: 'sakura', label: '樱花', hint: '花瓣飘落' },
  { id: 'fireflies', label: '萤火虫', hint: '微光游移' },
];

export const isParticleEffectId = (value: unknown): value is ParticleEffectId =>
  typeof value === 'string' && (PARTICLE_EFFECT_IDS as readonly string[]).includes(value);

export const DEFAULT_PARTICLE_EFFECT: ParticleEffectId = 'sakura';

export const readStoredParticleEffect = (): ParticleEffectId => {
  try {
    const saved = localStorage.getItem(PARTICLE_EFFECT_STORAGE_KEY);
    if (isParticleEffectId(saved)) {
      return saved;
    }
  } catch {
    // 存储不可用时回退默认特效。
  }
  return DEFAULT_PARTICLE_EFFECT;
};

export const writeStoredParticleEffect = (effect: ParticleEffectId): void => {
  try {
    localStorage.setItem(PARTICLE_EFFECT_STORAGE_KEY, effect);
  } catch {
    // 持久化为可选能力。
  }
};
