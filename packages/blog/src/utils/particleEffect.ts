/**
 * 氛围特效：粒子、ASCII 鲸鱼与鱼群可独立组合，最多同时开启两个。
 */

export const PARTICLE_EFFECT_STORAGE_KEY = 'particle-effect';
export const PARTICLE_EFFECT_IDS = ['rain', 'heavy-rain', 'sakura', 'fireflies'] as const;
export type ParticleEffectId = (typeof PARTICLE_EFFECT_IDS)[number];
export const ASCII_OCEAN_EFFECT_IDS = ['ascii-whale', 'ascii-fish'] as const;
export type AsciiOceanEffectId = (typeof ASCII_OCEAN_EFFECT_IDS)[number];
export const ATMOSPHERE_EFFECT_IDS = [...PARTICLE_EFFECT_IDS, ...ASCII_OCEAN_EFFECT_IDS] as const;
export type AtmosphereEffectId = (typeof ATMOSPHERE_EFFECT_IDS)[number];
export const MAX_ATMOSPHERE_EFFECTS = 2;
export const DEFAULT_ATMOSPHERE_EFFECTS: readonly AtmosphereEffectId[] = ['rain', 'ascii-whale'];

export const ATMOSPHERE_EFFECT_OPTIONS: ReadonlyArray<{
  id: AtmosphereEffectId;
  label: string;
  hint: string;
}> = [
  { id: 'rain', label: '小雨', hint: '细雨斜落' },
  { id: 'heavy-rain', label: '大雨', hint: '密集雨幕' },
  { id: 'sakura', label: '樱花', hint: '花瓣飘落' },
  { id: 'fireflies', label: '萤火虫', hint: '微光游移' },
  { id: 'ascii-whale', label: 'Ascall 鲸鱼', hint: '大鲸鱼缓缓游动' },
  { id: 'ascii-fish', label: 'Ascall 鱼群', hint: '成群字符小鱼' },
];

export const isAtmosphereEffectId = (value: unknown): value is AtmosphereEffectId =>
  typeof value === 'string' && (ATMOSPHERE_EFFECT_IDS as readonly string[]).includes(value);

export const readStoredAtmosphereEffects = (): readonly AtmosphereEffectId[] => {
  try {
    const saved = localStorage.getItem(PARTICLE_EFFECT_STORAGE_KEY);
    // 兼容原有单选存储；空数组表示用户显式关闭了所有特效。
    if (isAtmosphereEffectId(saved)) {
      return [saved];
    }
    if (saved !== null) {
      const parsed: unknown = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        return [...new Set(parsed.filter(isAtmosphereEffectId))].slice(0, MAX_ATMOSPHERE_EFFECTS);
      }
    }
  } catch {
    // 存储不可用时回退默认特效。
  }
  return DEFAULT_ATMOSPHERE_EFFECTS;
};

export const writeStoredAtmosphereEffects = (effects: readonly AtmosphereEffectId[]): void => {
  try {
    localStorage.setItem(PARTICLE_EFFECT_STORAGE_KEY, JSON.stringify(effects));
  } catch {
    // 持久化为可选能力。
  }
};

export const toggleAtmosphereEffect = (
  effects: readonly AtmosphereEffectId[],
  effect: AtmosphereEffectId,
): readonly AtmosphereEffectId[] => {
  if (effects.includes(effect)) {
    return effects.filter((selected) => selected !== effect);
  }
  return effects.length < MAX_ATMOSPHERE_EFFECTS ? [...effects, effect] : effects;
};
