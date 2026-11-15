import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useHref } from 'react-router-dom';
import { Cloud, Download, FileText, LockKeyhole, RefreshCw, Upload, X } from 'lucide-react';
import { AccountCredentials } from '@/cloud/AccountCredentials';
import { Seo } from '@/components/Seo';
import { downloadBlob } from '@/utils/download';
import { useResume } from './useResume';
import { importNotice } from './markdown';
import { validResumeState } from './model';
import './resume.css';

const ResumeEditor = lazy(() => import('./ResumeEditor'));
type Mode = 'edit' | 'markdown' | 'preview';
const statusText = {
  saved: '已保存到云端',
  pending: '待保存',
  saving: '正在保存…',
  error: '保存失败',
  conflict: '存在版本冲突',
};

export default function Resume() {
  const resume = useResume();
  const returnTo = useHref('/resume');
  return (
    <section className="resume-page" aria-label="我的简历">
      {(resume.phase === 'loading' || resume.phase === 'error') && <h1 className="sr-only">简历工作区</h1>}
      <Seo
        title="我的简历"
        description="登录后管理自己的简历，支持 Markdown、文档编辑和文字高亮。"
        url="/resume"
        noindex
      />
      {resume.phase === 'loading' && (
        <p className="resume-access" role="status">
          正在加载简历…
        </p>
      )}
      {resume.phase === 'unauthorized' && (
        <div className="resume-access">
          <FileText size={30} className="resume-access-icon" aria-hidden="true" />
          <h1>我的简历</h1>
          <p>登录后编辑自己的简历，内容仅自己可见。</p>
          <AccountCredentials user={null} onUser={() => void resume.reload()} />
          <a
            className="resume-button resume-github"
            href={`/api/v1/auth/github/start?return_to=${encodeURIComponent(returnTo)}`}
          >
            使用 GitHub 登录
          </a>
        </div>
      )}
      {resume.phase === 'error' && (
        <div className="resume-access">
          <p role="alert">{resume.error}</p>
          <button type="button" className="resume-button" onClick={() => void resume.reload()}>
            重新加载
          </button>
        </div>
      )}
      {resume.phase === 'ready' && resume.user && resume.view && (
        <Workspace key={`${resume.user.id}:${resume.sessionId}`} resume={resume} />
      )}
    </section>
  );
}

function Workspace({ resume }: { resume: ReturnType<typeof useResume> }) {
  const [mode, setMode] = useState<Mode>('edit');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [importing, setImporting] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const generation = useRef(0);
  const view = resume.view!;
  const contentRef = useRef(view.state);
  contentRef.current = view.state;
  useEffect(
    () => () => {
      ++generation.current;
    },
    [],
  );
  const exportMarkdown = () => {
    try {
      downloadBlob(new Blob([contentRef.current.markdown], { type: 'text/markdown;charset=utf-8' }), '我的简历.md');
      if (contentRef.current.comments?.length)
        setNotice('Markdown 已导出。评论内容请使用「备份」导出，之后可通过「导入」恢复。');
    } catch {
      setError('Markdown 下载失败，请切换源码模式复制内容。');
    }
  };
  const exportBackup = () => {
    try {
      downloadBlob(
        new Blob([JSON.stringify(contentRef.current, null, 2)], { type: 'application/json' }),
        '我的简历-含评论.json',
      );
    } catch {
      setError('备份下载失败，请重试。');
    }
  };
  const importFile = async (input: File) => {
    const id = ++generation.current;
    setError('');
    setNotice('');
    setImporting(true);
    const before = contentRef.current;
    try {
      const backup = /\.json$/i.test(input.name);
      if (!/\.(md|markdown|txt|json)$/i.test(input.name) || input.size > (backup ? 2 : 1) * 1024 * 1024)
        throw new Error('请选择 1 MB 以内的 Markdown 文件，或 2 MB 以内的简历 JSON 备份。');
      const text = (await input.text()).replace(/^\uFEFF/, '');
      if (id !== generation.current) return;
      if (contentRef.current !== before) throw new Error('读取文件期间简历已更改，请重新导入。');
      const imported = backup ? JSON.parse(text) : { version: 1, markdown: text, comments: [] };
      if (!validResumeState(imported)) throw new Error('文件格式或内容长度不符合简历要求。');
      if (
        (before.markdown.trim() || before.comments?.length) &&
        !window.confirm('导入将替换当前简历及评论，确定继续？')
      )
        return;
      resume.update(imported);
      setMode('edit');
      setNotice(backup ? '简历与评论已从备份恢复。' : importNotice(text));
    } catch (cause) {
      if (id === generation.current) setError(cause instanceof Error ? cause.message : '文件读取失败，请重试');
    } finally {
      if (id === generation.current) setImporting(false);
    }
  };
  useEffect(() => {
    const save = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void resume.sync();
      }
    };
    window.addEventListener('keydown', save);
    return () => window.removeEventListener('keydown', save);
  }, [resume]);

  return (
    <>
      <header className="resume-heading">
        <div className="resume-title">
          <FileText size={19} aria-hidden="true" />
          <h1>我的简历</h1>
          <span>
            <LockKeyhole size={12} aria-hidden="true" />
            仅自己可见
          </span>
        </div>
        <div className="resume-file-actions">
          <button type="button" className="resume-button" disabled={importing} onClick={() => file.current?.click()}>
            <Upload size={14} aria-hidden="true" />
            {importing ? '读取中…' : '导入'}
          </button>
          <button type="button" className="resume-button" onClick={exportMarkdown}>
            <Download size={14} aria-hidden="true" />
            导出 Markdown
          </button>
          <button type="button" className="resume-button" title="备份正文与评论，可通过导入恢复" onClick={exportBackup}>
            备份
          </button>
          <input
            ref={file}
            className="sr-only"
            type="file"
            aria-label="导入简历 Markdown 或备份文件"
            accept=".md,.markdown,.txt,.json,text/markdown,text/plain,application/json"
            onChange={(event) => {
              const selected = event.target.files?.[0];
              event.target.value = '';
              if (selected) void importFile(selected);
            }}
          />
        </div>
      </header>
      <div className="resume-mode-row">
        <div className="resume-modes" role="group" aria-label="简历编辑模式">
          {(
            [
              ['edit', '文档编辑'],
              ['markdown', 'Markdown'],
              ['preview', '预览'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={mode === value}
              onClick={() => {
                setMode(value);
                setError('');
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <span
          className={`resume-save-label ${view.status === 'error' || view.status === 'conflict' ? 'is-error' : ''}`}
          role="status"
        >
          {statusText[view.status]}
        </span>
      </div>
      {notice && (
        <p className="resume-notice" role="status">
          {notice}
          <button type="button" aria-label="关闭导入提示" onClick={() => setNotice('')}>
            <X size={14} />
          </button>
        </p>
      )}
      {(error || resume.error || view.error || view.recoveryError) && (
        <div className="resume-error" role="alert">
          <p>{error || resume.error || view.error || view.recoveryError}</p>
          <button type="button" className="resume-button" onClick={exportBackup}>
            下载本机草稿
          </button>
          {view.status !== 'conflict' && (
            <button type="button" className="resume-button" onClick={() => void resume.sync()}>
              重试保存
            </button>
          )}
          {view.status === 'conflict' && (
            <button
              type="button"
              className="resume-button"
              onClick={() => {
                if (window.confirm('读取云端版本将替换当前草稿。请先下载需要保留的内容，确定继续？'))
                  void resume.reload(true);
              }}
            >
              读取云端版本
            </button>
          )}
        </div>
      )}
      <Suspense
        fallback={
          <p className="resume-access" role="status">
            正在打开文档…
          </p>
        }
      >
        <ResumeEditor
          state={view.state}
          onChange={resume.update}
          mode={mode}
          onModeChange={setMode}
          onError={setError}
        />
      </Suspense>
      <p className="resume-edit-hint">
        {mode === 'preview'
          ? '预览当前简历，切换「文档编辑」继续修改。'
          : mode === 'markdown'
            ? '颜色、高亮和评论定位使用内嵌 HTML 保存；删除定位标记后，评论仍会保留。'
            : '选中文字后右键可添加评论、高亮、标红、标绿；手机上可使用上方工具栏。'}
      </p>
      <ResumeSync resume={resume} exportBackup={exportBackup} />
    </>
  );
}

function ResumeSync({ resume, exportBackup }: { resume: ReturnType<typeof useResume>; exportBackup: () => void }) {
  const [open, setOpen] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const orb = useRef<HTMLButtonElement>(null);
  const view = resume.view!;
  useEffect(() => {
    if (!open) return;
    panel.current?.focus();
    const outside = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !panel.current?.contains(event.target) &&
        !orb.current?.contains(event.target)
      )
        setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        orb.current?.focus();
      }
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);
  return createPortal(
    <div className="resume-page resume-sync">
      {open && (
        <div ref={panel} className="resume-sync-panel" role="region" aria-label="简历同步详情" tabIndex={-1}>
          <header>
            <strong>云端同步</strong>
            <button
              type="button"
              aria-label="关闭同步详情"
              onClick={() => {
                setOpen(false);
                orb.current?.focus();
              }}
            >
              <X size={16} />
            </button>
          </header>
          <p>
            {resume.user?.name || resume.user?.login} · {statusText[view.status]}
          </p>
          <p className="resume-sync-note">修改后自动保存到你的账号。</p>
          {view.updatedAt && (
            <p className="resume-sync-note">最近保存：{new Date(view.updatedAt).toLocaleString('zh-CN')}</p>
          )}
          <div className="resume-sync-actions">
            <button
              type="button"
              className="resume-button"
              disabled={view.status === 'saving' || view.status === 'conflict'}
              onClick={() => void resume.sync()}
            >
              立即保存
            </button>
            <button
              type="button"
              className="resume-button"
              disabled={view.status !== 'saved'}
              onClick={() => void resume.reload()}
            >
              刷新云端
            </button>
            <button type="button" className="resume-button" onClick={exportBackup}>
              下载备份
            </button>
          </div>
        </div>
      )}
      <button
        ref={orb}
        type="button"
        className={`resume-sync-orb is-${view.status}`}
        aria-label={`简历云端同步：${statusText[view.status]}`}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {view.status === 'saving' ? <RefreshCw size={21} aria-hidden="true" /> : <Cloud size={23} aria-hidden="true" />}
        <i />
      </button>
    </div>,
    document.body,
  );
}
