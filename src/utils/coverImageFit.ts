const CONTAIN_MIN_RATIO = 0.9;
const CONTAIN_MAX_RATIO = 2;

export const getCoverObjectFit = (
  width?: number,
  height?: number,
): 'cover' | 'contain' => {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width! <= 0 || height! <= 0) {
    return 'cover';
  }

  const ratio = width! / height!;
  return ratio < CONTAIN_MIN_RATIO || ratio > CONTAIN_MAX_RATIO ? 'contain' : 'cover';
};
