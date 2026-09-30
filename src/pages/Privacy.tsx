import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, LockKeyhole, Smile } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { Seo } from '@/components/Seo';
import { PrivacyPasswordModal } from '@/components/PrivacyPasswordModal';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { grantPrivacyAccess, readPrivacyAccess } from '@/utils/privacyAccess';

interface PrivacyLocationState {
  privacyUnlocked?: boolean;
}

export const Privacy: React.FC = () => {
  const location = useLocation();
  const shouldReduceMotion = useReducedMotion();
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

  const introMotion = shouldReduceMotion
    ? { initial: false, animate: { opacity: 1, y: 0, scale: 1 } }
    : {
        initial: { opacity: 0.76, y: 18, scale: 0.992 },
        animate: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.5, ease: 'easeOut' as const } },
      };

  const cardMotion = shouldReduceMotion
    ? { initial: false, animate: { opacity: 1, y: 0 } }
    : {
        initial: { opacity: 0.72, y: 14 },
        animate: { opacity: 1, y: 0, transition: { duration: 0.44, ease: 'easeOut' as const, delay: 0.08 } },
      };

  return (
    <div className="relative min-h-[calc(100vh-2rem)] overflow-hidden px-4 py-4 text-zinc-100 md:py-6">
      <Seo title="隐私页" description="D-blog 的隐私页，仅对通过口令验证的访问者开放。" noindex />

      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.08),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(148,163,184,0.1),transparent_30%),linear-gradient(180deg,rgba(255,255,255,0.03),transparent_24%)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-[12%] top-10 h-48 rounded-full bg-white/6 blur-3xl"
      />

      <motion.section
        aria-label="隐私页面"
        className="relative mx-auto max-w-5xl"
        initial={introMotion.initial}
        animate={introMotion.animate}
      >
        <div className="mb-6 flex items-center justify-between gap-3">
          <Link
            to="/"
            className="inline-flex min-h-11 items-center gap-2 rounded-control border border-white/12 bg-white/[0.04] px-3.5 text-sm font-medium text-zinc-100 backdrop-blur-xl transition-colors hover:border-white/24 hover:bg-white/[0.08]"
          >
            <ArrowLeft size={16} aria-hidden="true" />
            返回首页
          </Link>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-zinc-500">
            <Smile size={15} aria-hidden="true" />
            Private
          </div>
        </div>

        <div className="overflow-hidden rounded-[20px] border border-white/10 bg-[linear-gradient(135deg,rgba(255,255,255,0.09),rgba(255,255,255,0.03))] shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-2xl">
          <div className="border-b border-white/10 px-5 py-7 sm:px-7 sm:py-8">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-zinc-500">
              Like Love Mode, but quieter
            </p>
            <h1 className="mt-3 font-serif text-4xl font-bold tracking-tight text-white sm:text-5xl md:text-6xl">
              隐私页
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-zinc-300 sm:text-base">
              这里是站点里更安静的一层。界面退到纯黑和磨砂玻璃，只保留访问控制与内容本身；通过密码之后，才会展示这里的文章和资料。
            </p>
          </div>

          <div className="grid gap-4 px-5 py-5 sm:px-7 sm:py-7 lg:grid-cols-[1.25fr_0.75fr]">
            {hasAccess ? (
              <>
                <motion.div
                  className="rounded-[18px] border border-white/10 bg-[linear-gradient(135deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] p-5 backdrop-blur-xl"
                  initial={cardMotion.initial}
                  animate={cardMotion.animate}
                >
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
                    Access Granted
                  </p>
                  <h2 className="mt-3 text-2xl font-semibold text-white">内容暂未放入</h2>
                  <p className="mt-3 text-sm leading-7 text-zinc-300">
                    隐私页已经建立，但目前还没有文章或其他内容。后续如果这里加入私密文章、备忘或草稿，都会继续受这层密码校验保护。
                  </p>
                </motion.div>

                <motion.div
                  className="rounded-[18px] border border-white/10 bg-white/[0.03] p-5 backdrop-blur-xl"
                  initial={cardMotion.initial}
                  animate={{
                    ...cardMotion.animate,
                    transition: shouldReduceMotion
                      ? undefined
                      : { duration: 0.4, ease: 'easeOut' as const, delay: 0.14 },
                  }}
                >
                  <div className="flex items-center gap-2 text-zinc-200">
                    <LockKeyhole size={16} aria-hidden="true" />
                    <span className="text-sm font-medium">当前会话已解锁</span>
                  </div>
                  <p className="mt-3 text-sm leading-7 text-zinc-400">
                    这个状态只保留在当前浏览器会话。关闭会话或清理存储后，需要重新输入密码。
                  </p>
                </motion.div>
              </>
            ) : (
              <>
                <motion.div
                  className="rounded-[18px] border border-white/10 bg-[linear-gradient(135deg,rgba(255,255,255,0.08),rgba(255,255,255,0.02))] p-5 backdrop-blur-xl"
                  initial={cardMotion.initial}
                  animate={cardMotion.animate}
                >
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
                    Locked
                  </p>
                  <h2 className="mt-3 text-2xl font-semibold text-white">先输入密码，再看里面</h2>
                  <p className="mt-3 text-sm leading-7 text-zinc-300">
                    你已经到达隐私页路由，但正文区域仍然锁定。只有密码校验通过后，页面中的文章和内容才会显示。
                  </p>
                  <button
                    type="button"
                    onClick={() => setIsPasswordDialogOpen(true)}
                    className="mt-5 inline-flex min-h-11 items-center justify-center rounded-control border border-white/18 bg-white/10 px-4 text-sm font-semibold text-white transition-colors hover:border-white/28 hover:bg-white/16"
                  >
                    输入密码
                  </button>
                </motion.div>

                <motion.div
                  className="rounded-[18px] border border-dashed border-white/14 bg-white/[0.025] p-5 backdrop-blur-lg"
                  initial={cardMotion.initial}
                  animate={{
                    ...cardMotion.animate,
                    transition: shouldReduceMotion
                      ? undefined
                      : { duration: 0.4, ease: 'easeOut' as const, delay: 0.14 },
                  }}
                >
                  <div className="flex items-center gap-2 text-zinc-200">
                    <Smile size={16} aria-hidden="true" />
                    <span className="text-sm font-medium">隐藏入口说明</span>
                  </div>
                  <p className="mt-3 text-sm leading-7 text-zinc-400">
                    入口现在收在首页页脚版权行的右侧。点击透明笑脸后会先弹出密码框，只有验证通过才会进入这里。
                  </p>
                </motion.div>
              </>
            )}
          </div>
        </div>
      </motion.section>

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
