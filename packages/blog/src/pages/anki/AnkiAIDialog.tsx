import { useEffect, useRef, useState } from 'react';
import { SlideModal } from '@/components/SlideModal';
import { AnkiMarkdown } from './AnkiMarkdown';
import { type AnkiCard } from './anki-api';
import {
  AIRequestError,
  aiErrorMessage,
  checkRunning,
  createAICheck,
  deleteAICheck,
  deleteAIKey,
  fetchAICheck,
  fetchAIChecks,
  fetchAISettings,
  formatAICopy,
  saveAIKey,
  type AICheck,
  type AISettings,
} from './anki-ai-api';

type View = 'home' | 'review' | 'history' | 'settings';
interface Props {
  card?: AnkiCard;
  onClose: () => void;
}
const stamp = (value: string) => new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
const buttonClass = 'anki-rating-button';

/** A single modal owns requests and focus. Opening it never creates a check. */
export function AnkiAIDialog({ card, onClose }: Props) {
  const [view, setView] = useState<View>(card ? 'home' : 'settings');
  const [settings, setSettings] = useState<AISettings | null>(null);
  const [key, setKey] = useState('');
  const [editingKey, setEditingKey] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [checks, setChecks] = useState<AICheck[]>([]);
  const [cursor, setCursor] = useState('');
  const [active, setActive] = useState<AICheck | null>(null);
  const [selected, setSelected] = useState<AICheck | null>(null);
  const [copyFallback, setCopyFallback] = useState('');
  const lifecycle = useRef<AbortController | null>(null);
  const inFlight = useRef(false);
  const mutation = useRef<string | null>(null);
  const selectionGeneration = useRef(0);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [uncertain, setUncertain] = useState(false);
  const [retry, setRetry] = useState(0);
  const alive = (signal?: AbortSignal) =>
    Boolean(lifecycle.current && !lifecycle.current.signal.aborted && !signal?.aborted);
  const message = (cause: unknown) => (cause instanceof Error ? cause.message : 'AI 操作失败，请重试');
  const handleError = (cause: unknown) => {
    if (!alive()) return;
    setError(message(cause));
    if (cause instanceof AIRequestError && cause.status === 401)
      window.dispatchEvent(new Event('dblog-account-change'));
  };
  const merge = (entries: AICheck[], append = false) =>
    setChecks((previous) => {
      const values = append ? [...previous, ...entries] : entries;
      return [...new Map(values.map((entry) => [entry.id, entry])).values()];
    });
  useEffect(() => {
    const controller = new AbortController();
    lifecycle.current = controller;
    void fetchAISettings(controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setSettings(value);
      })
      .catch((cause) => {
        if (!controller.signal.aborted) handleError(cause);
      });
    if (card)
      void fetchAIChecks(card.id, '', controller.signal)
        .then((list) => {
          if (controller.signal.aborted) return;
          merge(list.checks);
          setCursor(list.nextCursor);
          setActive(list.active ?? null);
        })
        .catch((cause) => {
          if (!controller.signal.aborted) handleError(cause);
        });
    return () => {
      controller.abort();
    };
    // The owning page remounts on card or account changes; retry only refreshes reads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card?.id, retry]);

  useEffect(() => {
    if (!active || !checkRunning(active)) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let delay = 2000;
    const poll = async () => {
      try {
        const next = await fetchAICheck(active.id, controller.signal);
        if (controller.signal.aborted || !alive()) return;
        setActive(next);
        setChecks((previous) => [next, ...previous.filter((entry) => entry.id !== next.id)]);
        setSelected((previous) => (previous?.id === next.id ? next : previous));
        if (checkRunning(next)) timer = setTimeout(poll, delay);
      } catch (cause) {
        if (controller.signal.aborted || !alive()) return;
        if (cause instanceof AIRequestError && (cause.status === 404 || cause.status === 401)) {
          setActive(null);
          handleError(cause);
          return;
        }
        setNotice('任务状态暂时无法获取，正在重新查询；不会再次调用 AI。');
        delay = Math.min(delay * 2, 10000);
        timer = setTimeout(poll, delay);
      }
    };
    timer = setTimeout(poll, delay);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.id, active?.status]);

  const run = async (operation: (signal: AbortSignal) => Promise<void>) => {
    if (inFlight.current || !alive()) return;
    inFlight.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    const controller = lifecycle.current!;
    try {
      await operation(controller.signal);
    } catch (cause) {
      if (!controller.signal.aborted) handleError(cause);
    } finally {
      inFlight.current = false;
      if (alive(controller.signal)) setBusy(false);
    }
  };
  const start = () =>
    void run(async (signal) => {
      if (!card) return;
      if (!settings?.available) {
        setError('服务端尚未配置 AI 加密主密钥，暂时不能检查。');
        return;
      }
      if (!settings.configured) {
        setView('settings');
        setNotice('请先配置 Key，保存后返回并手动开始。');
        return;
      }
      if (checkRunning(active)) return;
      if (!mutation.current) mutation.current = crypto.randomUUID();
      try {
        const value = await createAICheck(card.id, card.version, mutation.current, signal);
        if (!alive(signal)) return;
        mutation.current = null;
        setUncertain(false);
        setActive(value);
        setSelected(value);
        setView('review');
        setChecks((previous) => [value, ...previous.filter((entry) => entry.id !== value.id)]);
      } catch (cause) {
        if (!alive(signal)) return;
        if (!(cause instanceof AIRequestError) || cause.status >= 500 || cause.code === 'INVALID_RESPONSE') {
          setUncertain(true);
          setError('提交结果不确定。可查询历史，或使用“重查本次提交”复用原请求标识；不会自动重新付费调用。');
        } else {
          mutation.current = null;
          setUncertain(false);
          if (cause.code === 'AI_CHECK_RUNNING') {
            const list = await fetchAIChecks(card.id, '', signal);
            if (!alive(signal)) return;
            merge(list.checks);
            setActive(list.active ?? null);
            setCursor(list.nextCursor);
            setView('history');
          }
          throw cause;
        }
      }
    });
  const loadHistory = (append = false) =>
    void run(async (signal) => {
      if (!card) return;
      const generation = ++selectionGeneration.current;
      setView('history');
      setCopyFallback('');
      const list = await fetchAIChecks(card.id, append ? cursor : '', signal);
      if (!alive() || signal.aborted || generation !== selectionGeneration.current) return;
      merge(list.checks, append);
      setCursor(list.nextCursor);
      setActive(list.active ?? null);
      const id = !append ? list.checks[0]?.id : selected?.id;
      if (id && !append) {
        const detail = await fetchAICheck(id, signal);
        if (alive() && !signal.aborted && generation === selectionGeneration.current) setSelected(detail);
      } else if (!append) setSelected(null);
    });
  const select = (id: string) => {
    const generation = ++selectionGeneration.current;
    setCopyFallback('');
    if (!alive()) return;
    const controller = lifecycle.current!;
    void fetchAICheck(id, controller.signal)
      .then((detail) => {
        if (!controller.signal.aborted && alive() && generation === selectionGeneration.current) setSelected(detail);
      })
      .catch((cause) => {
        if (!controller.signal.aborted && generation === selectionGeneration.current) handleError(cause);
      });
  };
  const remove = () =>
    void run(async (signal) => {
      if (!selected) return;
      const id = selected.id;
      selectionGeneration.current++;
      await deleteAICheck(id, signal);
      if (!alive(signal)) return;
      setChecks((previous) => previous.filter((entry) => entry.id !== id));
      setSelected(null);
      setCopyFallback('');
      if (active?.id === id) setActive(null);
      setNotice('当前 AI 记录已删除，其余记录与复习进度保留。');
      setView('history');
    });
  const copy = async () => {
    if (!selected) return;
    const text = formatAICopy(selected);
    const generation = selectionGeneration.current;
    try {
      if (!navigator.clipboard?.writeText) throw new Error('unavailable');
      await navigator.clipboard.writeText(text);
      if (alive() && generation === selectionGeneration.current) setNotice('本轮原问题、原答案和 AI 评价已复制。');
    } catch {
      if (alive() && generation === selectionGeneration.current) {
        setCopyFallback(text);
        setNotice('自动复制未成功，请选中下方只读文本手动复制。');
      }
    }
  };
  const save = () =>
    void run(async (signal) => {
      if (!key.trim()) {
        setError('API Key 不能为空');
        return;
      }
      await saveAIKey(key.trim(), signal);
      if (!alive(signal)) return;
      setKey('');
      const value = await fetchAISettings(signal);
      if (!alive(signal)) return;
      setSettings(value);
      setEditingKey(false);
      setNotice('配置已加密保存；未自动检查，也未验证厂商凭据。');
      if (card) setView('home');
    });
  const clearKey = () =>
    void run(async (signal) => {
      await deleteAIKey(signal);
      if (!alive(signal)) return;
      setKey('');
      const value = await fetchAISettings(signal);
      if (!alive(signal)) return;
      setSettings(value);
      setEditingKey(false);
      setActive(null);
      setNotice('Key 已删除，尚未发送的任务停止；已完成历史保留。');
    });
  const toHome = () => {
    selectionGeneration.current++;
    setView(card ? 'home' : 'settings');
    setCopyFallback('');
    setError('');
  };
  const title =
    view === 'settings'
      ? 'DeepSeek API Key'
      : view === 'history'
        ? 'AI 历史'
        : view === 'review'
          ? 'AI Review'
          : 'Ai Check';
  return (
    <SlideModal
      isOpen
      onClose={onClose}
      initialFocusRef={closeRef}
      ariaLabelledby="anki-ai-title"
      className="anki-dialog-panel anki-ai-dialog"
    >
      <div className="anki-ai-content">
        <div className="anki-ai-header">
          <div>
            <h2 id="anki-ai-title">{title}</h2>
            {card && <p className="anki-ai-subtitle">当前卡片的问题与答案将用于独立评分；不会修改卡片或复习排期。</p>}
          </div>
          <button ref={closeRef} type="button" className={buttonClass} onClick={onClose}>
            关闭
          </button>
        </div>
        {view !== 'home' && card && (
          <button type="button" className="anki-ai-link" onClick={toHome}>
            返回 Ai Check
          </button>
        )}
        {error && (
          <p role="alert" className="anki-ai-error">
            {error}
            <button
              type="button"
              className="anki-ai-link"
              disabled={busy}
              onClick={() => setRetry((value) => value + 1)}
            >
              刷新状态
            </button>
          </p>
        )}
        {notice && (
          <p role="status" className="anki-ai-notice">
            {notice}
          </p>
        )}
        {view === 'home' && (
          <section className="anki-ai-entry">
            <h3>检查当前答案，或回看之前的评价</h3>
            <p>
              打开此窗口不会发送评分请求。点击“开始 Check”才会使用你的 API Key，将该卡片的问题与答案发送给
              DeepSeek，并在本站数据库保存一条新记录。
            </p>
            <div className="anki-ai-actions">
              <button
                type="button"
                className={`${buttonClass} anki-ai-primary`}
                disabled={busy || !settings || checkRunning(active)}
                onClick={start}
              >
                {uncertain ? '重查本次提交' : checkRunning(active) ? '正在检查…' : '开始 Check'}
              </button>
              <button type="button" className={buttonClass} disabled={busy} onClick={() => loadHistory()}>
                查看 AI 历史
              </button>
              <button
                type="button"
                className="anki-ai-link"
                onClick={() => {
                  setKey('');
                  setView('settings');
                }}
              >
                AI 设置
              </button>
            </div>
            <p className="anki-ai-subtitle">
              {!settings
                ? '正在读取 AI 配置…'
                : !settings.available
                  ? '服务端 AI 配置未启用。'
                  : settings.configured
                    ? `已配置 ${settings.maskedKey}。实际调用使用你的额度；评分仅供参考。`
                    : '尚未配置 Key；可以查看历史，开始检查前需要配置。'}
            </p>
          </section>
        )}
        {view === 'settings' && (
          <section className="anki-ai-settings">
            <p>
              API Key 按当前登录账号加密保存；登出、重新登录或更换设备后继续使用，无需重复输入。保存配置不会自动开始
              Check。
            </p>
            {settings && (
              <p className="anki-ai-subtitle">
                {settings.configured ? `当前配置：${settings.maskedKey}` : '尚未配置'}
                {!settings.available ? ' · 服务端加密配置不可用' : ''}
              </p>
            )}
            {settings?.configured && !editingKey ? (
              <button
                type="button"
                className={buttonClass}
                disabled={busy || !settings.available}
                onClick={() => {
                  setKey('');
                  setEditingKey(true);
                }}
              >
                修改 API Key
              </button>
            ) : (
              settings && (
                <>
                  <label>
                    <span>{settings.configured ? '新的 DeepSeek API Key' : '你的 DeepSeek API Key'}</span>
                    <input
                      type="password"
                      value={key}
                      onChange={(event) => setKey(event.target.value)}
                      maxLength={512}
                      autoComplete="off"
                      spellCheck={false}
                      className="anki-input"
                    />
                  </label>
                  <div className="anki-ai-actions">
                    <button
                      type="button"
                      className={`${buttonClass} anki-ai-primary`}
                      disabled={busy || !settings.available}
                      onClick={save}
                    >
                      {settings.configured ? '保存修改' : '保存配置'}
                    </button>
                    {settings.configured && (
                      <button
                        type="button"
                        className={buttonClass}
                        disabled={busy}
                        onClick={() => {
                          setKey('');
                          setEditingKey(false);
                        }}
                      >
                        取消修改
                      </button>
                    )}
                  </div>
                </>
              )
            )}
            {settings?.configured && (
              <div className="anki-ai-actions">
                <button type="button" className={buttonClass} disabled={busy} onClick={clearKey}>
                  删除 Key
                </button>
              </div>
            )}
          </section>
        )}
        {(view === 'history' || view === 'review') && (
          <>
            {view === 'review' && (
              <button type="button" className="anki-ai-link" disabled={busy} onClick={() => loadHistory()}>
                查看 AI 历史
              </button>
            )}
            <div className={view === 'history' ? 'anki-ai-history-layout' : ''}>
              {view === 'history' && (
                <div className="anki-ai-history-list" aria-label="评分记录选择">
                  {!checks.length && <p>暂无 AI 检查记录。</p>}
                  {checks.map((entry) => (
                    <button
                      key={entry.id}
                      type="button"
                      className={buttonClass}
                      aria-pressed={selected?.id === entry.id}
                      onClick={() => select(entry.id)}
                    >
                      <span>
                        {entry.score === null
                          ? entry.status === 'queued'
                            ? '排队中'
                            : entry.status === 'running'
                              ? '检查中'
                              : '无有效得分'
                          : `${entry.score} / 100`}
                      </span>
                      <small>{stamp(entry.createdAt)}</small>
                    </button>
                  ))}
                  {cursor && (
                    <button type="button" className={buttonClass} disabled={busy} onClick={() => loadHistory(true)}>
                      加载更早记录
                    </button>
                  )}
                </div>
              )}
              <article className="anki-ai-detail">
                {selected ? (
                  <>
                    {checkRunning(selected) ? (
                      <p role="status">
                        {selected.status === 'queued' ? '等待检查…' : '正在检查…'}关闭窗口不取消已创建的任务；稍后从 Ai
                        Check 中查看历史。
                      </p>
                    ) : selected.result ? (
                      <div className="anki-ai-result-head">
                        <strong className="anki-ai-score">
                          {selected.score}
                          <small> / 100</small>
                        </strong>
                        <p>{selected.result.summary}</p>
                      </div>
                    ) : (
                      <p role="status" className="anki-ai-error">
                        {aiErrorMessage(selected.errorCode)}
                      </p>
                    )}
                    {selected.cardVersion !== card?.version && (
                      <p className="anki-ai-notice">卡片已更新，以下保留检查时的版本 {selected.cardVersion}。</p>
                    )}
                    <section className="anki-ai-snapshot">
                      <h3>当时的问题</h3>
                      <AnkiMarkdown content={selected.questionSnapshot ?? ''} />
                      <h3>当时的答案</h3>
                      <AnkiMarkdown content={selected.answerSnapshot ?? ''} />
                    </section>
                    {selected.result && (
                      <>
                        {(['strengths', 'issues', 'suggestions'] as const).map((name, index) => (
                          <section key={name}>
                            <h3>{['回答优点', '存在的问题', '明确建议'][index]}</h3>
                            <ul>
                              {selected.result![name].map((text, i) => (
                                <li key={i}>{text}</li>
                              ))}
                              {!selected.result![name].length && <li>无</li>}
                            </ul>
                          </section>
                        ))}
                      </>
                    )}
                    <details>
                      <summary>当时发送的完整提问</summary>
                      <pre>{selected.userPromptSnapshot}</pre>
                    </details>
                    <div className="anki-ai-actions">
                      <button
                        type="button"
                        className={buttonClass}
                        disabled={busy || checkRunning(selected)}
                        onClick={() => void copy()}
                      >
                        复制本轮问答
                      </button>
                      <button type="button" className={buttonClass} disabled={busy} onClick={remove}>
                        删除此记录
                      </button>
                    </div>
                    <p className="anki-ai-subtitle">仅可查看、复制和删除，不能在历史后追加对话。</p>
                  </>
                ) : (
                  <p>选择一条历史查看，或返回 Ai Check 手动开始。</p>
                )}
                {copyFallback && (
                  <label className="anki-ai-copy">
                    <span>手动复制（只读）</span>
                    <textarea
                      readOnly
                      className="anki-input"
                      value={copyFallback}
                      onFocus={(event) => event.target.select()}
                    />
                  </label>
                )}
              </article>
            </div>
          </>
        )}
      </div>
    </SlideModal>
  );
}
