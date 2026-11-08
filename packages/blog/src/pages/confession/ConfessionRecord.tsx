import { lazy, Suspense, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, LockKeyhole } from 'lucide-react';
import { Seo } from '@/components/Seo';
import { ConfessionDialog } from './ConfessionDialog';
import type { useConfessions } from './useConfessions';
import './confession-record.css';
const Login = import.meta.env.VITE_DEPLOY_TARGET === 'cloud' ? lazy(() => import('./ConfessionLogin')) : null;
/** Only fetch the signed-in account archive. Never accept private text from URL or router state. */
export function ConfessionRecord({ id, archive }: { id: string; archive: ReturnType<typeof useConfessions> }) {
  const [login, setLogin] = useState(false);
  const entry = archive.user && archive.ready ? archive.state.entries.find((e) => e.id === id) : undefined;
  const category = entry ? archive.state.categories.find((c) => c.id === entry.categoryId) : undefined;
  return (
    <main className="confession-record-page">
      <Seo title="私密记事" description="登录后阅读属于自己的忏悔记事。" noindex structuredData={[]} image="" />
      <nav>
        <Link to="/confession">
          <ArrowLeft size={16} />
          返回忏悔场景
        </Link>
        <span>
          <LockKeyhole size={13} />
          仅本人可见
        </span>
      </nav>
      <article>
        {!archive.ready && !archive.error && <p role="status">正在核对账号与私密归档…</p>}
        {archive.error && (
          <div role="alert">
            <p>{archive.error}</p>
            <button type="button" onClick={() => void archive.refresh()}>
              重试加载
            </button>
          </div>
        )}
        {archive.ready && !archive.user && (
          <section>
            <h1>请登录</h1>
            <p>这是一则私密记事，只有所属账号可以阅读。</p>
            <button type="button" onClick={() => setLogin(true)}>
              登录后阅读
            </button>
          </section>
        )}
        {archive.ready && archive.user && !entry && (
          <section>
            <h1>无法查看这则记事</h1>
            <p>记录不存在，或不属于当前账号。</p>
          </section>
        )}
        {entry && (
          <>
            <header>
              <p className="confession-record-category">{category?.name ?? '私密归档'}</p>
              <h1>
                {entry.content
                  .split('\n')
                  .find((line) => line.trim())
                  ?.trim()
                  .slice(0, 48) || '一则留给自己的记事'}
              </h1>
              <time dateTime={entry.createdAt}>
                {new Date(entry.createdAt).toLocaleString('zh-CN', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </time>
            </header>
            <div className="confession-record-content">{entry.content}</div>
            <footer>已经归档的过错，不是对自己的判决。</footer>
          </>
        )}
      </article>
      {login && !archive.user && (
        <ConfessionDialog title="请登录" onClose={() => setLogin(false)}>
          {Login ? (
            <Suspense fallback={<p>加载登录…</p>}>
              <Login onDone={() => setLogin(false)} />
            </Suspense>
          ) : (
            <p>当前静态博客仅可观赏，私密记事需要在云端博客中阅读。</p>
          )}
        </ConfessionDialog>
      )}
    </main>
  );
}
