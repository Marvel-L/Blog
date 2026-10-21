/**
 * 浏览器端图片压缩（与构建期 profile 口径对齐：最长边 1920、JPEG ~82）。
 */

export const BROWSER_COMPRESS_PROFILE = {
  maxEdge: 1920,
  jpegQuality: 0.82,
  webpQuality: 0.8,
  maxFileBytes: 40 * 1024 * 1024,
  maxPixels: 40_000_000,
} as const;

export type BrowserCompressFormat = 'jpeg' | 'png' | 'webp';

export const formatByteSize = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

export const getCompressedFilename = (name: string, format: BrowserCompressFormat): string => {
  const base = (name || 'image').replace(/\.[^.]+$/, '') || 'image';
  const safe = base.replace(/[\\/:*?"<>|]+/g, '-').trim() || 'image';
  const ext = format === 'jpeg' ? 'jpg' : format;
  return `${safe}-compressed.${ext}`;
};

export const detectOutputFormat = (file: File): BrowserCompressFormat => {
  const type = (file.type || '').toLowerCase();
  const name = file.name.toLowerCase();
  if (type.includes('webp') || name.endsWith('.webp')) return 'webp';
  if (type.includes('png') || name.endsWith('.png')) return 'png';
  return 'jpeg';
};

const loadImageElement = (file: File) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    let settled = false;
    const cleanup = () => URL.revokeObjectURL(url);
    const timeoutId = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error('图片加载超时，请更换图片后重试。'));
    }, 10000);
    image.onload = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      cleanup();
      resolve(image);
    };
    image.onerror = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      cleanup();
      reject(new Error('图片加载失败，请选择有效的图片文件。'));
    };
    image.src = url;
  });

const canvasToBlob = (canvas: HTMLCanvasElement, format: BrowserCompressFormat, quality: number) =>
  new Promise<Blob>((resolve, reject) => {
    const mime = format === 'jpeg' ? 'image/jpeg' : format === 'webp' ? 'image/webp' : 'image/png';
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('图片导出失败，请重试。'))),
      mime,
      format === 'png' ? undefined : quality,
    );
  });

export type BrowserCompressResult = {
  blob: Blob;
  width: number;
  height: number;
  format: BrowserCompressFormat;
  originalBytes: number;
  bytes: number;
  filename: string;
};

/** 在浏览器本地压缩单张图片，不上传。 */
export const compressImageInBrowser = async (file: File): Promise<BrowserCompressResult> => {
  if (file.size > BROWSER_COMPRESS_PROFILE.maxFileBytes) {
    throw new Error('图片过大（上限 40MB），请先缩小后再试。');
  }

  const image = await loadImageElement(file);
  const pixels = image.naturalWidth * image.naturalHeight;
  if (pixels > BROWSER_COMPRESS_PROFILE.maxPixels) {
    throw new Error('图片像素过多，请更换较小的图片。');
  }

  const maxEdge = BROWSER_COMPRESS_PROFILE.maxEdge;
  const scale = Math.min(1, maxEdge / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('当前浏览器无法处理画布，请更换浏览器后重试。');
  }

  const format = detectOutputFormat(file);
  if (format === 'jpeg') {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
  }
  ctx.drawImage(image, 0, 0, width, height);

  const quality = format === 'webp' ? BROWSER_COMPRESS_PROFILE.webpQuality : BROWSER_COMPRESS_PROFILE.jpegQuality;
  const blob = await canvasToBlob(canvas, format, quality);

  return {
    blob,
    width,
    height,
    format,
    originalBytes: file.size,
    bytes: blob.size,
    filename: getCompressedFilename(file.name, format),
  };
};
