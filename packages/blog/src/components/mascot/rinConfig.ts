/**
 * The bundled artwork is an opaque vector 2D preview, not a Cubism model.
 * Set modelUrl after supplying a complete exported Cubism model and its Core.
 * Both paths are site-relative and go through assetUrl for /Blog/ deployments.
 */
export const rinConfig = {
  enabled: true,
  modelUrl: '',
  coreUrl: '/live2d/live2dcubismcore.min.js',
};

export const RIN_PREFERENCE_KEY = 'd-blog-rin-mascot';

export const RIN_REACTION_DURATION = { idle: 0, wave: 2400, nod: 1800, stretch: 3200, tea: 3800 } as const;
export type RinReaction = keyof typeof RIN_REACTION_DURATION;

export type RinPreference = {
  collapsed: boolean;
  paused: boolean;
  side: 'left' | 'right';
};

export const readRinPreference = (): Partial<RinPreference> => {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(RIN_PREFERENCE_KEY) ?? 'null');
    if (!value || typeof value !== 'object') return {};
    const entry = value as Record<string, unknown>;
    return {
      ...(typeof entry.collapsed === 'boolean' ? { collapsed: entry.collapsed } : {}),
      ...(typeof entry.paused === 'boolean' ? { paused: entry.paused } : {}),
      ...(entry.side === 'left' || entry.side === 'right' ? { side: entry.side } : {}),
    };
  } catch {
    return {};
  }
};

export const saveRinPreference = (preference: RinPreference): boolean => {
  try {
    localStorage.setItem(RIN_PREFERENCE_KEY, JSON.stringify(preference));
    return true;
  } catch {
    return false;
  }
};

export const RIN_MESSAGES = [
  '慢慢看吧，我在这里陪你。',
  '代码看累了，就看看远处。山一直在那里。',
  '今天也有好好吃饭吗？热乎乎的东西最治愈了。',
  '一个人安静地读点东西，也像一场小小的露营。',
  '不着急。读懂一小段，也算今天的收获。',
] as const;
