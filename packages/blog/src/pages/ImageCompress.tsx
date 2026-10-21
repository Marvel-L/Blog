/**
 * 图片压缩工具页：本地上传压缩下载 + 站内已压缩图片收益一览。
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Download, Image as ImageIcon, Minimize2, Upload, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Seo } from '../components/Seo';
import { downloadBlob } from '@/utils/download';
import {
  BROWSER_COMPRESS_PROFILE,
  compressImageInBrowser,
  formatByteSize,
  type BrowserCompressResult,
} from './image-compress/compressImage';
import { sortCompressReportItems, truncateCompressReportItems } from './image-compress/compressReport';
import { getImageCompressReport } from '@/services/imageCompressReport';

type Feedback = { kind: 'success' | 'error'; message: string } | null;

const cardClass = 'editorial-surface p-4 min-[360px]:p-5 md:p-6';
/** 列表区域最多展示条数，超出用 … 省略（避免撑破首屏）。 */
const MAX_VISIBLE_COMPRESS_ROWS = 8;

export const ImageCompress: React.FC = () => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mountedRef = useRef(true);
  const generationRef = useRef(0);
  const [sourceName, setSourceName] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [result, setResult] = useState<BrowserCompressResult | null>(null);
  const [isWorking, setIsWorking] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  const reportItems = useMemo(() => sortCompressReportItems(getImageCompressReport().items), []);
  const { visible, omitted, hasMore } = useMemo(
    () => truncateCompressReportItems(reportItems, MAX_VISIBLE_COMPRESS_ROWS),
    [reportItems],
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const reset = () => {
    generationRef.current += 1;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setSourceName(null);
    setResult(null);
    setFeedback(null);
    setIsWorking(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setFeedback({ kind: 'error', message: '请选择图片文件（jpg / png / webp）。' });
      return;
    }

    const generation = ++generationRef.current;
    setIsWorking(true);
    setFeedback(null);
    setResult(null);

    try {
      const next = await compressImageInBrowser(file);
      if (!mountedRef.current || generation !== generationRef.current) return;
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(URL.createObjectURL(next.blob));
      setSourceName(file.name);
      setResult(next);
      const saved = next.originalBytes - next.bytes;
      setFeedback({
        kind: 'success',
        message:
          saved > 0
            ? `已压缩：${formatByteSize(next.originalBytes)} → ${formatByteSize(next.bytes)}（节省 ${formatByteSize(saved)}）`
            : `已处理：${formatByteSize(next.bytes)}（体积几乎未变）`,
      });
    } catch (error) {
      if (!mountedRef.current || generation !== generationRef.current) return;
      setFeedback({
        kind: 'error',
        message: error instanceof Error ? error.message : '压缩失败，请重试。',
      });
    } finally {
      if (mountedRef.current && generation === generationRef.current) {
        setIsWorking(false);
      }
    }
  };

  const downloadResult = () => {
    if (!result) return;
    downloadBlob(result.blob, result.filename);
  };

  return (
    <div className="editorial-page">
      <Seo title="图片压缩" description="在浏览器本地压缩图片并下载，同时查看站内文章已压缩图片的体积收益。" />

      <header className="mb-8 md:mb-10">
        <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.22em] text-zinc-500 dark:text-zinc-400">Tools</p>
        <h1 className="text-3xl font-bold tracking-tight text-ink dark:text-white md:text-4xl">图片压缩</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-zinc-600 dark:text-zinc-400 md:text-base">
          本地上传即可压缩下载（不上传到服务器）。下方列出构建期已压缩的文章配图收益，按节省体积从大到小排列。
        </p>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5 lg:gap-8">
        <aside className={`${cardClass} lg:col-span-2`} aria-label="上传与下载">
          <div className="mb-5 border-b border-zinc-200 pb-4 dark:border-zinc-800">
            <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.22em] text-zinc-500 dark:text-zinc-400">
              Compress
            </p>
            <h2 className="text-xl font-bold text-ink dark:text-white">本地压缩</h2>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/*"
            className="sr-only"
            onChange={(event) => {
              void handleFile(event.target.files?.[0]);
            }}
          />

          <div className="space-y-3">
            <button
              type="button"
              className="editorial-button-primary flex min-h-11 w-full items-center justify-center gap-2"
              disabled={isWorking}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload size={15} />
              {isWorking ? '压缩中…' : '选择图片'}
            </button>

            {sourceName && (
              <p className="truncate text-xs text-zinc-500 dark:text-zinc-400" title={sourceName}>
                当前：{sourceName}
              </p>
            )}

            {result && (
              <dl className="grid grid-cols-2 gap-2 rounded-control border border-zinc-200 bg-zinc-50 p-3 text-xs dark:border-zinc-800 dark:bg-zinc-950/50">
                <div>
                  <dt className="text-zinc-500 dark:text-zinc-400">原始</dt>
                  <dd className="font-medium text-ink dark:text-white">{formatByteSize(result.originalBytes)}</dd>
                </div>
                <div>
                  <dt className="text-zinc-500 dark:text-zinc-400">压缩后</dt>
                  <dd className="font-medium text-ink dark:text-white">{formatByteSize(result.bytes)}</dd>
                </div>
                <div>
                  <dt className="text-zinc-500 dark:text-zinc-400">尺寸</dt>
                  <dd className="font-medium text-ink dark:text-white">
                    {result.width}×{result.height}
                  </dd>
                </div>
                <div>
                  <dt className="text-zinc-500 dark:text-zinc-400">格式</dt>
                  <dd className="font-medium uppercase text-ink dark:text-white">{result.format}</dd>
                </div>
              </dl>
            )}

            <div className="grid grid-cols-1 gap-2 min-[360px]:grid-cols-2">
              <button type="button" className="editorial-button min-h-11" onClick={reset} disabled={isWorking}>
                <X size={15} />
                清除
              </button>
              <button
                type="button"
                className="editorial-button-primary min-h-11"
                disabled={!result || isWorking}
                onClick={downloadResult}
              >
                <Download size={15} />
                下载
              </button>
            </div>

            <p className="text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400">
              策略与站点构建一致：最长边 ≤ {BROWSER_COMPRESS_PROFILE.maxEdge}px，JPEG 质量约{' '}
              {Math.round(BROWSER_COMPRESS_PROFILE.jpegQuality * 100)}。
            </p>

            {feedback && (
              <p
                className={`break-words text-xs ${feedback.kind === 'error' ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}
                role="status"
              >
                {feedback.message}
              </p>
            )}
          </div>
        </aside>

        <section className={`${cardClass} lg:col-span-3`} aria-label="压缩预览">
          <div className="mb-5 flex items-center justify-between border-b border-zinc-200 pb-4 dark:border-zinc-800">
            <div>
              <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.22em] text-zinc-500 dark:text-zinc-400">
                Preview
              </p>
              <h2 className="text-xl font-bold text-ink dark:text-white">预览</h2>
            </div>
            {result && <Minimize2 size={16} className="text-zinc-400" aria-hidden />}
          </div>
          <div className="flex min-h-[16rem] min-w-0 items-center justify-center overflow-hidden rounded-control border border-zinc-200 bg-zinc-100 p-3 dark:border-zinc-800 dark:bg-zinc-950/60 md:min-h-[20rem]">
            {previewUrl ? (
              <img src={previewUrl} alt="压缩后预览" className="max-h-[20rem] max-w-full object-contain" />
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex min-h-11 min-w-0 flex-col items-center justify-center gap-3 px-2 text-zinc-500 transition-colors hover:text-ink dark:text-zinc-400 dark:hover:text-white"
              >
                <ImageIcon size={40} strokeWidth={1.2} />
                <span className="text-center text-sm">选择图片开始压缩</span>
              </button>
            )}
          </div>
        </section>
      </div>

      <section className={`${cardClass} mt-6 md:mt-8`} aria-label="站内已压缩图片">
        <div className="mb-4 border-b border-zinc-200 pb-4 dark:border-zinc-800">
          <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.22em] text-zinc-500 dark:text-zinc-400">
            Site library
          </p>
          <h2 className="text-xl font-bold text-ink dark:text-white">文章配图压缩收益</h2>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            展示格式：文章 — 图片，原大小 → 目标大小（按节省体积从大到小）。
          </p>
        </div>

        {visible.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            暂无已记录的压缩收益。运行一次构建或本地压缩后会出现在这里。
          </p>
        ) : (
          <div className="max-h-[22rem] overflow-hidden">
            <ul className="divide-y divide-zinc-200 dark:divide-zinc-800" role="list">
              {visible.map((item) => (
                <li
                  key={item.path}
                  className="flex flex-col gap-1 py-3 text-sm sm:flex-row sm:items-baseline sm:justify-between sm:gap-4"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-ink dark:text-white">
                      {item.articleId ? (
                        <Link to={`/post/${item.articleId}`} className="font-medium underline-offset-2 hover:underline">
                          {item.article}
                        </Link>
                      ) : (
                        <span className="font-medium">{item.article}</span>
                      )}
                      <span className="text-zinc-400 dark:text-zinc-500"> — </span>
                      <span className="text-zinc-600 dark:text-zinc-300">{item.image}</span>
                    </p>
                  </div>
                  <p className="shrink-0 font-mono text-xs text-zinc-600 dark:text-zinc-300 sm:text-sm">
                    {formatByteSize(item.originalBytes)}
                    <span className="mx-1.5 text-zinc-400">→</span>
                    {formatByteSize(item.bytes)}
                    <span className="ml-2 text-emerald-600 dark:text-emerald-400">
                      −{formatByteSize(item.savedBytes)}
                    </span>
                  </p>
                </li>
              ))}
            </ul>
            {hasMore && (
              <p className="border-t border-zinc-200 pt-3 text-sm text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                … 及其他 {omitted} 项
              </p>
            )}
          </div>
        )}
      </section>
    </div>
  );
};
