import { lazy, Suspense, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Church, Feather, LockKeyhole, Pause, Play, Plus } from 'lucide-react';
import { Seo } from '@/components/Seo';
import { ConfessionScene } from './confession/ConfessionScene';
import { ConfessionDialog } from './confession/ConfessionDialog';
import { ConfessionEntryForm, NewTombstone } from './confession/ConfessionForms';
import { useConfessions } from './confession/useConfessions';
import type { ConfessionCategory, ConfessionState } from './confession/model';
import './confession/confession.css';
const Login =
  import.meta.env.VITE_DEPLOY_TARGET === 'cloud' ? lazy(() => import('./confession/ConfessionLogin')) : null;
type Modal = 'login' | 'category' | 'entry' | ConfessionCategory | null;
export function Confession() {
  const archive = useConfessions();
  return <ConfessionExperience key={archive.session} archive={archive} />;
}
function ConfessionExperience({ archive }: { archive: ReturnType<typeof useConfessions> }) {
  const [churchView, setChurchView] = useState(false);
  const [fog, setFog] = useState(48);
  const [paused, setPaused] = useState(false);
  const [bubble, setBubble] = useState(false);
  const [entryCategory, setEntryCategory] = useState<string>();
  const [modal, setModal] = useState<Modal>(null);
  const [message, setMessage] = useState('');
  const guard = (operation: () => void) => {
    if (!archive.user) {
      setMessage('请登录');
      setModal('login');
      return;
    }
    if (!archive.ready) {
      setMessage('归档尚未加载，请重试');
      return;
    }
    operation();
  };
  const save = async (next: ConfessionState) => {
    if (await archive.save(next)) {
      setModal(null);
      setMessage('已保存到你的私密归档');
      return true;
    }
    return false;
  };
  const selected = modal && typeof modal === 'object' ? modal : null;
  const entries = selected
    ? archive.state.entries
        .filter((entry) => entry.categoryId === selected.id)
        .slice()
        .reverse()
    : [];
  return (
    <main className="confession-page">
      <Seo
        title="忏悔"
        description="在雾中的墓地与微光教堂之间，留一个安静的倾诉角落。登录后建立属于自己的墓碑分类与私密记事。"
        url="/confession"
      />
      <ConfessionScene
        churchView={churchView}
        state={archive.state}
        fog={fog}
        paused={paused}
        bubble={bubble}
        blocked={modal !== null}
        onTomb={(category) => guard(() => setModal(category))}
        onChurch={(inside) => {
          setChurchView(inside);
          if (!inside) setBubble(false);
          setMessage('');
        }}
        onSaint={() => guard(() => setBubble(true))}
        onWrite={() => guard(() => setModal('entry'))}
      />
      <header className="confession-header">
        <Link to="/" className="confession-brand">
          <Church size={21} strokeWidth={1.2} />
          <span>
            D-blog <i>／</i> 忏悔
          </span>
        </Link>
        <div className="confession-header-actions">
          <button
            type="button"
            onClick={() => {
              if (archive.user) {
                window.dispatchEvent(new Event('dblog-account-open'));
              } else setModal('login');
            }}
          >
            <LockKeyhole size={14} />
            {archive.user ? '我的账号' : '登录'}
          </button>
          <Link to="/">
            返回博客 <ArrowUpRight size={15} />
          </Link>
        </div>
      </header>
      {!churchView ? (
        <div className="confession-intro">
          <span className="confession-eyebrow">A QUIET PLACE TO LET GO</span>
          <h1>
            让过错，
            <br />
            在这里安眠。
          </h1>
          <p>
            走过雾，教堂的门还为你留着。
            <br />
            有些话，写下就好。
          </p>
          <button type="button" onClick={() => guard(() => setModal('entry'))} className="confession-intro-link">
            <Feather size={15} />
            写一则忏悔 <ArrowUpRight size={14} />
          </button>
        </div>
      ) : (
        <div className="confession-church-intro">
          <span className="confession-eyebrow">THE LIGHT IS STILL ON</span>
          <h1>我在听。</h1>
          <p>点击凛，把今天想说的留在这里。</p>
        </div>
      )}
      <footer className="confession-controls">
        <div className="confession-control-actions">
          <button type="button" onClick={() => guard(() => setModal('category'))}>
            <Plus size={16} />
            新增墓碑
          </button>
          <button
            type="button"
            onClick={() => guard(() => setPaused(!paused))}
            aria-label={paused ? '继续场景动画' : '暂停场景动画'}
          >
            {paused ? <Play size={15} /> : <Pause size={15} />}
          </button>
          <label htmlFor="confession-fog-range">雾的浓度</label>
          <input
            id="confession-fog-range"
            type="range"
            min="0"
            max="100"
            value={fog}
            onChange={(event) => guard(() => setFog(Number(event.target.value)))}
            aria-valuetext={`${fog}%`}
          />
          <span className="confession-fog-value">{fog}%</span>
        </div>
        <div className="confession-private-note">
          <LockKeyhole size={12} />
          <span>{archive.user ? '每一则记事，仅你可见' : '场景公开可见 · 交互请先登录'}</span>
        </div>
      </footer>
      <div className="confession-status" role="status" aria-live="polite">
        {archive.error || message}
        {archive.error && (
          <button
            type="button"
            onClick={() => {
              void archive.refresh();
            }}
          >
            重试加载
          </button>
        )}
      </div>
      {modal === 'login' && (
        <ConfessionDialog title="请登录" onClose={() => setModal(null)}>
          {Login ? (
            <Suspense fallback={<p>加载登录…</p>}>
              <Login
                onDone={() => {
                  setModal(null);
                  setMessage('');
                }}
              />
            </Suspense>
          ) : (
            <p>当前是静态博客，账号交互需要在云端博客中使用。场景仍可观赏。</p>
          )}
        </ConfessionDialog>
      )}
      {archive.user && modal === 'category' && (
        <ConfessionDialog title="新增墓碑" onClose={() => setModal(null)}>
          <NewTombstone state={archive.state} busy={archive.busy} onSave={save} />
          <p role="status">{archive.error}</p>
        </ConfessionDialog>
      )}
      {archive.user && modal === 'entry' && (
        <ConfessionDialog title="写下你的忏悔" onClose={() => setModal(null)}>
          <ConfessionEntryForm
            state={archive.state}
            busy={archive.busy}
            initialCategory={entryCategory}
            onSave={save}
          />
          <p role="status">{archive.error}</p>
        </ConfessionDialog>
      )}
      {archive.user && selected && (
        <ConfessionDialog title={selected.name} onClose={() => setModal(null)}>
          <p className="confession-archive-caption">已经归档的过错 · {entries.length} 则记事 · 仅本人可见</p>
          {entries.length ? (
            <ol className="confession-records">
              {entries.map((entry) => (
                <li key={entry.id}>
                  <time dateTime={entry.createdAt}>{entry.createdAt.slice(0, 10)}</time>
                  <p>{entry.content}</p>
                </li>
              ))}
            </ol>
          ) : (
            <p className="confession-empty">这座墓碑还没有记事。愿你不再被过去困住。</p>
          )}
          <button
            type="button"
            className="confession-primary"
            onClick={() => {
              setEntryCategory(selected.id);
              setModal('entry');
            }}
          >
            <Feather size={16} />
            写一则记事
          </button>
        </ConfessionDialog>
      )}
    </main>
  );
}
