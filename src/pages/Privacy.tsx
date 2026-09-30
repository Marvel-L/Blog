import React, { useEffect, useState } from 'react';
import { ArrowLeft, LockKeyhole, Smile } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { Seo } from '@/components/Seo';
import { PrivacyPasswordModal } from '@/components/PrivacyPasswordModal';
import { grantPrivacyAccess, readPrivacyAccess } from '@/utils/privacyAccess';

interface PrivacyLocationState {
  privacyUnlocked?: boolean;
}

export const Privacy: React.FC = () => {
  const location = useLocation();
  const locationState = (location.state as PrivacyLocationState | null) ?? null;
  const [hasAccess, setHasAccess] = useState(Boolean(locationState?.privacyUnlocked));
  const [isPasswordDialogOpen, setIsPasswordDialogOpen] = useState(false);

  useEffect(() => {
    if (locationState?.privacyUnlocked) {
      return;
    }
    setHasAccess(readPrivacyAccess());
  }, [locationState?.privacyUnlocked]);

  const handleGrantAccess = () => {
    grantPrivacyAccess();
    setHasAccess(true);
    setIsPasswordDialogOpen(false);
  };

  return (
    <div className="relative min-h-[calc(100vh-8rem)] overflow-hidden px-4 py-8 md:py-12">
      <Seo title="隐私页" description="D-blog 的隐私页，仅对通过口令验证的访问者开放。" noindex />

      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(244,114,182,0.16),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(251,191,36,0.16),transparent_32%),linear-gradient(180deg,rgba(255,255,255,0.82),rgba(255,255,255,0.3))] dark:bg-[radial-gradient(circle_at_top_left,rgba(244,114,182,0.2),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(251,191,36,0.14),transparent_32%),linear-gradient(180deg,rgba(24,24,27,0.72),rgba(9,9,11,0.92))]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-16 h-40 w-40 -translate-x-1/2 rounded-full bg-rose-200/40 blur-3xl dark:bg-rose-500/20"
      />

      <section aria-label="隐私页面" className="relative mx-auto max-w-4xl">
        <div className="mb-6 flex items-center justify-between gap-3">
          <Link
            to="/"
            className="inline-flex min-h-11 items-center gap-2 rounded-control border border-zinc-300 bg-white/70 px-3.5 text-sm font-medium text-zinc-700 backdrop-blur transition-colors hover:border-zinc-500 hover:bg-white dark:border-zinc-700 dark:bg-zinc-950/60 dark:text-zinc-200 dark:hover:bg-zinc-900"
          >
            <ArrowLeft size={16} aria-hidden="true" />
            返回首页
          </Link>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
            <Smile size={15} aria-hidden="true" />
            Private
          </div>
        </div>

        <div className="overflow-hidden rounded-overlay border border-white/70 bg-white/70 backdrop-blur-xl dark:border-white/10 dark:bg-zinc-950/60">
          <div className="border-b border-zinc-200/70 px-5 py-6 dark:border-zinc-800/80 sm:px-7">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-zinc-500 dark:text-zinc-400">
              Like Love Mode, but quieter
            </p>
            <h1 className="mt-3 font-serif text-4xl font-bold tracking-tight text-ink dark:text-white sm:text-5xl">
              隐私页
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-zinc-600 dark:text-zinc-300 sm:text-base">
              这里保留一层比 Love 页面更克制的入口。只有通过密码验证，才允许查看后续放进来的文章和内容。
            </p>
          </div>

          <div className="grid gap-4 px-5 py-5 sm:px-7 sm:py-7 lg:grid-cols-[1.25fr_0.75fr]">
            {hasAccess ? (
              <>
                <div className="rounded-surface border border-zinc-200/80 bg-[linear-gradient(135deg,rgba(255,255,255,0.94),rgba(250,245,255,0.88))] p-5 dark:border-zinc-800 dark:bg-[linear-gradient(135deg,rgba(39,39,42,0.78),rgba(24,24,27,0.94))]">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500 dark:text-zinc-400">
                    Access Granted
                  </p>
                  <h2 className="mt-3 text-2xl font-semibold text-ink dark:text-white">内容暂未放入</h2>
                  <p className="mt-3 text-sm leading-7 text-zinc-600 dark:text-zinc-300">
                    隐私页已经建立，但目前还没有文章或其他内容。后续如果这里加入私密文章、备忘或草稿，都会继续受这层密码校验保护。
                  </p>
                </div>

                <div className="rounded-surface border border-zinc-200/80 bg-zinc-50/80 p-5 dark:border-zinc-800 dark:bg-zinc-900/80">
                  <div className="flex items-center gap-2 text-zinc-600 dark:text-zinc-300">
                    <LockKeyhole size={16} aria-hidden="true" />
                    <span className="text-sm font-medium">当前会话已解锁</span>
                  </div>
                  <p className="mt-3 text-sm leading-7 text-zinc-500 dark:text-zinc-400">
                    这个状态只保留在当前浏览器会话。关闭会话或清理存储后，需要重新输入密码。
                  </p>
                </div>
              </>
            ) : (
              <>
                <div className="rounded-surface border border-zinc-200/80 bg-[linear-gradient(135deg,rgba(255,255,255,0.94),rgba(255,245,247,0.9))] p-5 dark:border-zinc-800 dark:bg-[linear-gradient(135deg,rgba(39,39,42,0.78),rgba(24,24,27,0.94))]">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500 dark:text-zinc-400">
                    Locked
                  </p>
                  <h2 className="mt-3 text-2xl font-semibold text-ink dark:text-white">先输入密码，再看里面</h2>
                  <p className="mt-3 text-sm leading-7 text-zinc-600 dark:text-zinc-300">
                    你已经到达隐私页路由，但正文区域仍然锁定。只有密码校验通过后，页面中的文章和内容才会显示。
                  </p>
                  <button
                    type="button"
                    onClick={() => setIsPasswordDialogOpen(true)}
                    className="mt-5 inline-flex min-h-11 items-center justify-center rounded-control border border-zinc-900 bg-zinc-900 px-4 text-sm font-semibold text-white transition-colors hover:bg-zinc-700 dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
                  >
                    输入密码
                  </button>
                </div>

                <div className="rounded-surface border border-dashed border-zinc-300 bg-white/70 p-5 dark:border-zinc-700 dark:bg-zinc-950/50">
                  <div className="flex items-center gap-2 text-zinc-600 dark:text-zinc-300">
                    <Smile size={16} aria-hidden="true" />
                    <span className="text-sm font-medium">隐藏入口说明</span>
                  </div>
                  <p className="mt-3 text-sm leading-7 text-zinc-500 dark:text-zinc-400">
                    首页右下角有一个低可见度的透明笑脸按钮。点击后会先弹出密码框，只有验证通过才会进入这里。
                  </p>
                </div>
              </>
            )}
          </div>
        </div>
      </section>

      <PrivacyPasswordModal
        isOpen={isPasswordDialogOpen}
        onClose={() => setIsPasswordDialogOpen(false)}
        onSuccess={handleGrantAccess}
        title="验证隐私页密码"
        description="输入密码后，才能查看隐私页面内的文章和内容。"
      />
    </div>
  );
};
