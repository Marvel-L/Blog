import React, { lazy, Suspense } from 'react';
import { Seo } from './Seo';

const LoveTasks = import.meta.env.VITE_DEPLOY_TARGET === 'cloud' ? lazy(() => import('@/cloud/LoveTasks')) : null;

export const LoveSurface: React.FC<{ showTasks?: boolean }> = ({ showTasks = false }) => (
  <>
    <Seo title="Love 面" description="D-blog 的 Love 面：收起原有栏目，只保留更私密的一层入口与氛围。" />
    <section aria-label="Love 首页" className="min-h-[calc(100vh-8rem)]">
      {showTasks &&
        (LoveTasks ? (
          <Suspense
            fallback={
              <p role="status" className="text-center text-rose-50">
                正在打开必做清单…
              </p>
            }
          >
            <LoveTasks />
          </Suspense>
        ) : (
          <div className="mx-auto max-w-xl rounded-2xl border border-white/25 bg-white/85 p-6 text-center text-rose-950">
            <p>必做清单需要登录云端账号。</p>
            <a
              href="https://43.138.216.53/Blog/"
              className="mt-4 inline-block rounded-full bg-rose-100 px-5 py-2 text-sm font-medium"
            >
              前往云端登录
            </a>
          </div>
        ))}
    </section>
  </>
);
