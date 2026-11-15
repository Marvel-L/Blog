import { useCallback, useEffect, useRef, useState } from 'react';
import { useHref, useSearchParams } from 'react-router-dom';
import { GitBranch, LockKeyhole, Plus, Search } from 'lucide-react';
import { AccountCredentials } from '@/cloud/AccountCredentials';
import { cloudRequest, CloudError, type CloudUser } from '@/cloud/api';
import { Seo } from '@/components/Seo';
import { MindCanvas } from './MindCanvas';
import { UUID, newMindState, type MindLayout, type MindState, type MindSummary } from './model';
import { clearMindDrafts, validateMap, type MapResponse } from './sync';
import { useMindDocument } from './useMindDocument';
import './mind.css';

interface Dashboard {
  user: CloudUser;
  maps: MindSummary[];
}

function MapPreview({ layout }: { layout: MindLayout }) {
  return (
    <svg viewBox="0 0 280 140" aria-hidden="true" className="mind-preview">
      {layout === 'mind' ? (
        <>
          <path d="M140 70C100 70 100 35 64 35M140 70C100 70 100 104 64 104M140 70C185 70 185 35 221 35M140 70C185 70 185 104 221 104" />
          <rect x="30" y="24" width="62" height="22" rx="7" className="preview-purple" />
          <rect x="30" y="93" width="62" height="22" rx="7" className="preview-blue" />
          <rect x="190" y="24" width="62" height="22" rx="7" className="preview-peach" />
          <rect x="190" y="93" width="62" height="22" rx="7" className="preview-green" />
          <rect x="105" y="54" width="70" height="32" rx="9" className="preview-root" />
        </>
      ) : (
        <>
          <path d="M70 70C108 70 108 31 149 31M70 70H149M70 70C108 70 108 109 149 109M190 70C210 70 210 51 240 51M190 70C210 70 210 92 240 92" />
          <rect x="20" y="54" width="68" height="32" rx="9" className="preview-root" />
          <rect x="130" y="21" width="62" height="22" rx="7" className="preview-purple" />
          <rect x="130" y="59" width="62" height="22" rx="7" className="preview-blue" />
          <rect x="130" y="98" width="62" height="22" rx="7" className="preview-peach" />
          <rect x="226" y="43" width="35" height="17" rx="5" className="preview-green" />
          <rect x="226" y="84" width="35" height="17" rx="5" className="preview-green" />
        </>
      )}
    </svg>
  );
}

function Editor({
  user,
  id,
  onBack,
  onUnauthorized,
  onCopy,
  busy,
}: {
  user: string;
  id: string;
  onBack: () => void;
  onUnauthorized: () => void;
  onCopy: (state: MindState) => Promise<void>;
  busy: boolean;
}) {
  const document = useMindDocument(user, id, onUnauthorized);
  const [leaving, setLeaving] = useState(false);
  const live = useRef(false);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);
  const back = async () => {
    setLeaving(true);
    const saved = await document.flush();
    if (!live.current) return;
    setLeaving(false);
    const warning = document.snapshot?.recoveryError
      ? '导图尚未保存，浏览器也无法保留恢复草稿。离开可能丢失修改，仍返回列表？'
      : '导图尚未保存到云端，本机恢复草稿已保留。仍返回列表？';
    if (saved || window.confirm(warning)) onBack();
  };
  if (document.loadError)
    return (
      <div className="mind-access">
        <p role="alert">{document.loadError}</p>
        <button className="mind-button" onClick={document.retry}>
          重新加载
        </button>
        <button className="mind-button" onClick={onBack}>
          返回列表
        </button>
      </div>
    );
  if (!document.snapshot)
    return (
      <p className="mind-loading" role="status">
        正在打开导图…
      </p>
    );
  return (
    <MindCanvas
      snapshot={document.snapshot}
      onChange={document.update}
      onBack={() => {
        void back();
      }}
      onRetry={() => {
        void document.flush();
      }}
      onCopy={() => {
        if (document.snapshot) void onCopy(document.snapshot.state);
      }}
      onLoadCloud={document.loadCloud}
      busy={busy || leaving}
    />
  );
}

export default function Mind() {
  const [params, setParams] = useSearchParams();
  const id = params.get('id') ?? '';
  const [data, setData] = useState<Dashboard | null>(null);
  const [phase, setPhase] = useState<'loading' | 'ready' | 'unauthorized' | 'error'>('loading');
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [query, setQuery] = useState('');
  const [layout, setLayout] = useState<MindLayout>('mind');
  const [busy, setBusy] = useState(false);
  const generation = useRef(0);
  const creating = useRef(false);
  const currentUser = useRef('');
  const pendingCreate = useRef<{ id: string; body: string } | null>(null);
  const write = useRef<AbortController | null>(null);
  const loginReturn = useHref('/mind');
  const retry = useCallback(() => setReload((n) => n + 1), []);
  const unauthorized = useCallback(() => {
    if (currentUser.current) clearMindDrafts(currentUser.current);
    currentUser.current = '';
    generation.current++;
    write.current?.abort();
    pendingCreate.current = null;
    creating.current = false;
    setBusy(false);
    setData(null);
    setPhase('unauthorized');
  }, []);
  useEffect(() => {
    const epochRef = generation;
    const changed = () => {
      unauthorized();
      retry();
    };
    window.addEventListener('dblog-account-change', changed);
    return () => {
      epochRef.current++;
      write.current?.abort();
      window.removeEventListener('dblog-account-change', changed);
    };
  }, [retry, unauthorized]);
  useEffect(() => {
    const controller = new AbortController(),
      epoch = ++generation.current;
    setPhase('loading');
    setError('');
    void cloudRequest<Dashboard>('/mind/maps', {
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]),
    })
      .then((response) => {
        if (epoch !== generation.current || controller.signal.aborted) return;
        if (
          !response.user?.id ||
          !Array.isArray(response.maps) ||
          response.maps.some(
            (map) =>
              !UUID.test(map.id) ||
              typeof map.title !== 'string' ||
              !['mind', 'logic'].includes(map.layout) ||
              !Number.isFinite(Date.parse(map.updatedAt)) ||
              !Number.isInteger(map.nodeCount),
          )
        )
          throw new Error('导图列表格式异常');
        currentUser.current = response.user.id;
        setData(response);
        setPhase('ready');
      })
      .catch((cause) => {
        if (epoch !== generation.current || controller.signal.aborted) return;
        setData(null);
        setPhase(cause instanceof CloudError && cause.status === 401 ? 'unauthorized' : 'error');
        setError(cause instanceof Error ? cause.message : '导图列表加载失败');
      });
    return () => controller.abort();
  }, [reload]);

  const create = async (copy?: MindState) => {
    if (!data || creating.current) return;
    creating.current = true;
    setBusy(true);
    setError('');
    const epoch = generation.current,
      controller = new AbortController();
    write.current = controller;
    try {
      pendingCreate.current ??= {
        id: crypto.randomUUID(),
        body: JSON.stringify({
          baseRevision: 0,
          mutationId: crypto.randomUUID(),
          state: copy ? { ...copy, title: `${copy.title.slice(0, 110)} · 副本` } : newMindState(layout),
        }),
      };
      const pending = pendingCreate.current;
      const response = await cloudRequest<MapResponse>(`/mind/maps/${pending.id}`, {
        method: 'PUT',
        body: pending.body,
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]),
      });
      if (epoch !== generation.current || controller.signal.aborted) return;
      validateMap(response, data.user.id, pending.id);
      pendingCreate.current = null;
      setParams({ id: pending.id });
    } catch (cause) {
      if (epoch !== generation.current || controller.signal.aborted) return;
      if (cause instanceof CloudError && cause.status === 401) unauthorized();
      else setError(cause instanceof Error ? cause.message : '创建失败，请重试');
    } finally {
      if (epoch === generation.current) {
        creating.current = false;
        setBusy(false);
      }
    }
  };
  const back = () => {
    setParams({});
    retry();
  };
  const maps = data?.maps.filter((map) => map.title.toLocaleLowerCase().includes(query.toLocaleLowerCase())) ?? [];

  return (
    <section className="mind-page" aria-label="Mind 思维导图">
      {(phase === 'loading' || phase === 'error' || (phase === 'ready' && id && UUID.test(id))) && (
        <h1 className="sr-only">Mind 思维导图</h1>
      )}
      <Seo
        title="Mind · 思维导图"
        description="用思维导图和逻辑图整理想法。登录后创建私人导图，实时保存主题、表情标记与画布位置。"
        url="/mind"
        noindex
      />
      {phase === 'loading' && (
        <p className="mind-loading" role="status">
          正在加载 Mind…
        </p>
      )}
      {phase === 'unauthorized' && (
        <div className="mind-access">
          <div className="mind-access-icon">
            <LockKeyhole size={24} />
          </div>
          <h1>登录后，展开你的想法</h1>
          <p>思维导图与逻辑图，仅自己可见。</p>
          <AccountCredentials user={null} onUser={retry} />
          <a className="mind-button" href={`/api/v1/auth/github/start?return_to=${encodeURIComponent(loginReturn)}`}>
            使用 GitHub 登录
          </a>
        </div>
      )}
      {phase === 'error' && (
        <div className="mind-access">
          <p role="alert">{error}</p>
          <button className="mind-button" onClick={retry}>
            重新加载
          </button>
        </div>
      )}
      {phase === 'ready' && data && (
        <>
          {error && (
            <p className="mind-save-error" role="alert">
              {error}
              <button
                onClick={() => {
                  void create();
                }}
              >
                重试
              </button>
            </p>
          )}
          {id && UUID.test(id) ? (
            <Editor
              key={`${data.user.id}:${id}`}
              user={data.user.id}
              id={id}
              onBack={back}
              onUnauthorized={unauthorized}
              onCopy={create}
              busy={busy}
            />
          ) : (
            <div className="mind-dashboard">
              <header className="mind-dashboard-header">
                <div>
                  <h1>
                    Mind<span>我的导图</span>
                  </h1>
                  <p>{data.maps.length} 份导图 · 仅自己可见</p>
                </div>
                <label className="mind-search">
                  <Search size={16} />
                  <input
                    aria-label="搜索导图"
                    placeholder="搜索导图"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                  />
                </label>
              </header>
              <div className="mind-library-label">
                <span>最近编辑</span>
                <span>想法，从一个主题开始。</span>
              </div>
              <div className="mind-map-grid">
                <div className="mind-create-card">
                  <button
                    className="mind-create"
                    onClick={() => {
                      void create();
                    }}
                    disabled={busy}
                  >
                    <span className="mind-plus">
                      <Plus size={28} strokeWidth={1.5} />
                    </span>
                    <span>{busy ? '正在创建…' : '新建导图'}</span>
                  </button>
                  <div className="mind-create-layout" aria-label="新导图结构">
                    <button aria-pressed={layout === 'mind'} onClick={() => setLayout('mind')}>
                      思维导图
                    </button>
                    <button aria-pressed={layout === 'logic'} onClick={() => setLayout('logic')}>
                      逻辑图
                    </button>
                  </div>
                </div>
                {maps.map((map) => (
                  <button className="mind-map-card" key={map.id} onClick={() => setParams({ id: map.id })}>
                    <MapPreview layout={map.layout} />
                    <span className="mind-map-title">{map.title}</span>
                    <span className="mind-map-meta">
                      <span>
                        <GitBranch size={12} />
                        {map.layout === 'mind' ? '思维导图' : '逻辑图'} · {map.nodeCount} 主题
                      </span>
                      <time dateTime={map.updatedAt}>
                        {new Date(map.updatedAt).toLocaleDateString('zh-CN', {
                          timeZone: 'Asia/Shanghai',
                          month: '2-digit',
                          day: '2-digit',
                        })}
                      </time>
                    </span>
                  </button>
                ))}
              </div>
              {query && !maps.length && <p className="mind-empty">没有找到“{query}”</p>}
            </div>
          )}
        </>
      )}
    </section>
  );
}
