import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Color, TextStyle } from '@tiptap/extension-text-style';
import Highlight from '@tiptap/extension-highlight';
import { TableKit } from '@tiptap/extension-table';
import type { Node as DocumentNode } from '@tiptap/pm/model';
import type { Transaction } from '@tiptap/pm/state';
import {
  Bold,
  Italic,
  Underline,
  List,
  ListOrdered,
  Undo2,
  Redo2,
  Highlighter,
  Eraser,
  Heading2,
  Heading3,
  Pilcrow,
  MessageSquarePlus,
  Link,
  ImagePlus,
  Code2,
} from 'lucide-react';
import {
  cleanResumeHtml,
  GREEN,
  HIGHLIGHT,
  htmlToMarkdown,
  markdownToHtml,
  RED,
  safeDocumentLink,
  safeImageUrl,
} from './markdown';
import { ResumeImage } from './image';
import {
  COMMENT_ATTR,
  commentIds,
  MAX_COMMENTS,
  MAX_COMMENT_QUOTE,
  MAX_MARKDOWN,
  validResumeState,
  type ResumeComment,
  type ResumeState,
} from './model';
import { addCommentAnchor, commentRanges, documentMarkdown, removeCommentAnchor, ResumeCommentMark } from './comments';
import ResumeComments, { type CommentDraft } from './ResumeComments';
import { ResumeCodeBlock } from './ResumeCodeBlock';

const extensions = [
  StarterKit.configure({
    codeBlock: false,
    link: {
      openOnClick: 'whenNotEditable',
      defaultProtocol: 'https',
      isAllowedUri: (url) => safeDocumentLink(url),
    },
  }),
  TextStyle,
  Color,
  Highlight.configure({ multicolor: true }),
  TableKit,
  ResumeCommentMark,
  ResumeImage,
];
type MarkAction = 'highlight' | 'red' | 'green' | 'clear';
function applyMark(editor: Editor, action: MarkAction, range?: { from: number; to: number }) {
  const chain = editor.chain().focus();
  if (range) chain.setTextSelection(range);
  if (action === 'highlight') chain.setHighlight({ color: HIGHLIGHT }).run();
  if (action === 'red') chain.setColor(RED).run();
  if (action === 'green') chain.setColor(GREEN).run();
  if (action === 'clear') chain.unsetColor().unsetHighlight().run();
}
const marks: { action: MarkAction; label: string; className: string }[] = [
  { action: 'highlight', label: '高亮', className: 'resume-mark-yellow' },
  { action: 'red', label: '标红', className: 'resume-mark-red' },
  { action: 'green', label: '标绿', className: 'resume-mark-green' },
  { action: 'clear', label: '清除颜色', className: '' },
];

export default function ResumeEditor({
  state,
  onChange,
  mode,
  onModeChange,
  onError,
  onCommentDraft,
  documentLabel = '定稿正文',
  maxMarkdown = MAX_MARKDOWN,
  placeholder = '# 定稿标题\n\n## 正文\n\n[Book 来源](/Blog/book)\n\n[Mind 问题](/Blog/mind)\n\n![方案图](https://你的图片链接)',
  commentsLabel = '定稿评论',
  autoFocus = false,
}: {
  state: ResumeState;
  onChange: (value: ResumeState) => void;
  mode: 'edit' | 'markdown' | 'preview';
  onModeChange: (mode: 'edit' | 'preview') => void;
  onError: (message: string) => void;
  onCommentDraft?: (pending: boolean) => void;
  documentLabel?: string;
  maxMarkdown?: number;
  placeholder?: string;
  commentsLabel?: string;
  autoFocus?: boolean;
}) {
  const sourceId = useId();
  const { markdown } = state;
  const readonly = mode !== 'edit';
  const last = useRef(markdown);
  const currentState = useRef(state);
  currentState.current = state;
  const callbacks = useRef({ onChange, onError });
  callbacks.current = { onChange, onError };
  const [menu, setMenu] = useState<{ x: number; y: number; from: number; to: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<string | null>(null);
  const [draft, setDraft] = useState<CommentDraft | null>(null);
  useEffect(() => {
    onCommentDraft?.(draft !== null);
    return () => onCommentDraft?.(false);
  }, [draft, onCommentDraft]);
  const draftRange = useRef<{ from: number; to: number; doc: DocumentNode; markdown: string } | null>(null);
  const pendingLocate = useRef<string | null>(null);
  const editor = useEditor({
    extensions: [...extensions, ResumeCodeBlock],
    immediatelyRender: false,
    content: '',
    editable: !readonly,
    editorProps: {
      attributes: {
        class: 'resume-document prose max-w-none',
        'aria-label': documentLabel,
        role: 'textbox',
        'aria-multiline': 'true',
      },
      transformPastedHTML: (html) => cleanResumeHtml(html, false),
    },
    onUpdate: ({ editor: current }) => {
      try {
        const next = htmlToMarkdown(current.getHTML());
        const updated = { ...currentState.current, markdown: next };
        if (!validResumeState(updated) || [...next].length > maxMarkdown)
          throw new Error(`正文最多支持 ${maxMarkdown / 10000} 万字，请缩短内容。`);
        last.current = next;
        currentState.current = updated;
        callbacks.current.onChange(updated);
      } catch (error) {
        callbacks.current.onError(error instanceof Error ? error.message : '内容转换失败，请保留当前内容后重试');
      }
    },
  });
  const selection = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      selected: Boolean(current && !current.state.selection.empty),
      bold: current?.isActive('bold'),
      italic: current?.isActive('italic'),
      underline: current?.isActive('underline'),
      anchors: current ? [...commentRanges(current.state.doc).keys()] : [],
    }),
  });
  const initialized = useRef(false);
  useEffect(() => {
    if (!editor || (initialized.current && last.current === markdown)) return;
    try {
      editor.commands.setContent(markdownToHtml(markdown), { emitUpdate: false });
      last.current = markdown;
      initialized.current = true;
    } catch {
      callbacks.current.onError('Markdown 解析失败，请在源码模式检查内容。');
    }
  }, [editor, markdown]);
  useEffect(() => {
    editor?.setEditable(!readonly, false);
    if (editor && autoFocus && !readonly) editor.commands.focus(undefined, { scrollIntoView: false });
  }, [editor, readonly, autoFocus]);
  useEffect(() => {
    if (!editor) return;
    for (const node of editor.view.dom.querySelectorAll(`[${COMMENT_ATTR}]`)) {
      node.classList.toggle(
        'is-comment-active',
        Boolean(active && commentIds(node.getAttribute(COMMENT_ATTR)).includes(active)),
      );
    }
    if (mode !== 'markdown' && pendingLocate.current) {
      const node = editor.view.dom.querySelector(`[${COMMENT_ATTR}~="${pendingLocate.current}"]`);
      node?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      pendingLocate.current = null;
    }
  }, [editor, markdown, active, mode]);
  useEffect(() => {
    if (!menu) return;
    menuRef.current?.querySelector('button')?.focus();
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !menuRef.current?.contains(event.target)) setMenu(null);
    };
    const scroll = () => setMenu(null);
    document.addEventListener('pointerdown', dismiss);
    window.addEventListener('scroll', scroll, true);
    window.addEventListener('resize', scroll);
    return () => {
      document.removeEventListener('pointerdown', dismiss);
      window.removeEventListener('scroll', scroll, true);
      window.removeEventListener('resize', scroll);
    };
  }, [menu]);
  const openMenu = (x: number, y: number) => {
    if (!editor || readonly || editor.state.selection.empty) return false;
    const { from, to } = editor.state.selection;
    setMenu({
      from,
      to,
      x: Math.max(8, Math.min(x, window.innerWidth - 200)),
      y: Math.max(8, Math.min(y, window.innerHeight - 248)),
    });
    return true;
  };
  const startComment = (range?: { from: number; to: number }) => {
    if (!editor || readonly) return;
    if ((currentState.current.comments?.length ?? 0) >= MAX_COMMENTS)
      return onError('最多保留 100 条评论，请先删除不需要的评论。');
    if (draft && !window.confirm('放弃当前未提交的评论，重新选择原文？')) return;
    const { from, to } = range ?? editor.state.selection;
    const quote = editor.state.doc.textBetween(from, to, '\n').trim();
    if (!quote) return onError('请先选中需要评论的正文。');
    if ([...quote].length > MAX_COMMENT_QUOTE) return onError('一次最多评论 1000 字，请缩小选区。');
    draftRange.current = { from, to, doc: editor.state.doc, markdown: currentState.current.markdown };
    setDraft({ quote, body: '' });
    setMenu(null);
    onError('');
  };
  const commitComments = (comments: ResumeComment[], tr?: Transaction) => {
    if (!editor) return;
    const updated = {
      ...currentState.current,
      comments,
      markdown: tr?.docChanged ? documentMarkdown(tr.doc) : currentState.current.markdown,
    };
    if (!validResumeState(updated) || [...updated.markdown].length > maxMarkdown)
      throw new Error('评论无法保存，请检查内容长度或特殊控制字符。');
    // Persist anchors and metadata together; comment operations do not enter text undo history.
    if (tr?.docChanged) editor.view.dispatch(tr.setMeta('preventUpdate', true).setMeta('addToHistory', false));
    last.current = updated.markdown;
    currentState.current = updated;
    onChange(updated);
    onError('');
  };
  const submitComment = () => {
    if (!editor || readonly || !draft?.body.trim()) return;
    try {
      const comments = currentState.current.comments ?? [];
      if (draft.id) {
        commitComments(
          comments.map((comment) => (comment.id === draft.id ? { ...comment, body: draft.body.trim() } : comment)),
        );
      } else {
        const range = draftRange.current;
        if (!range || !range.doc.eq(editor.state.doc) || range.markdown !== currentState.current.markdown) {
          return onError('写评论期间正文已更改，请复制评论内容后取消，再重新选中原文。');
        }
        const comment = {
          id: crypto.randomUUID(),
          quote: draft.quote,
          body: draft.body.trim(),
          createdAt: new Date().toISOString(),
        };
        commitComments([...comments, comment], addCommentAnchor(editor.state, range, comment.id));
        setActive(comment.id);
      }
      setDraft(null);
      draftRange.current = null;
    } catch (error) {
      onError(error instanceof Error ? error.message : '评论保存失败，请重试。');
    }
  };
  const locate = (id: string) => {
    if (!editor) return;
    const ranges = commentRanges(editor.state.doc).get(id);
    if (!ranges?.length) return;
    setActive(id);
    editor.commands.setTextSelection({ from: ranges[0].from, to: ranges.at(-1)!.to });
    if (mode === 'markdown') {
      pendingLocate.current = id;
      onModeChange('preview');
    } else
      editor.view.dom
        .querySelector(`[${COMMENT_ATTR}~="${id}"]`)
        ?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  };

  return (
    <div className="resume-workspace">
      <div className="resume-editor">
        {mode === 'markdown' && (
          <div className="resume-source">
            <label htmlFor={sourceId}>
              Markdown 源码<span>支持粘贴全文、图片和来源链接</span>
            </label>
            <textarea
              id={sourceId}
              aria-label={documentLabel}
              value={markdown}
              maxLength={maxMarkdown}
              spellCheck={false}
              placeholder={placeholder}
              onChange={(event) => onChange({ ...currentState.current, markdown: event.target.value })}
            />
          </div>
        )}
        {!readonly && editor && (
          <div className="resume-toolbar" role="toolbar" aria-label="定稿格式">
            <button
              type="button"
              aria-label="插入或修改链接"
              title="链接（可引用 Book、Mind 和定稿）"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                const href = window.prompt(
                  '输入链接（支持网站地址、/Blog/book/...、/Blog/mind 和当前定稿链接）；留空移除链接',
                  editor.getAttributes('link').href ?? '',
                );
                if (href === null) return;
                if (!href.trim()) {
                  editor.chain().focus().extendMarkRange('link').unsetLink().run();
                  return;
                }
                if (!safeDocumentLink(href.trim())) {
                  onError('请输入 HTTP / HTTPS 地址或以 / 开头的站内链接。');
                  return;
                }
                editor.chain().focus().extendMarkRange('link').setLink({ href: href.trim() }).run();
              }}
            >
              <Link size={16} />
            </button>
            <button
              type="button"
              aria-label="插入图片链接"
              title="插入图片链接"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                const src = window.prompt('输入可访问的 HTTP / HTTPS 图片链接');
                if (src === null) return;
                if (!safeImageUrl(src.trim())) {
                  onError('图片需要可访问的 HTTP / HTTPS 链接。');
                  return;
                }
                const alt = window.prompt('图片说明', '') ?? '';
                editor
                  .chain()
                  .focus()
                  .insertContent({ type: 'image', attrs: { src: src.trim(), alt } })
                  .run();
              }}
            >
              <ImagePlus size={16} />
            </button>
            <span className="resume-separator" aria-hidden="true" />
            <button
              type="button"
              title="Go 代码块"
              aria-label="Go 代码块"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => editor.chain().focus().toggleCodeBlock({ language: 'go' }).run()}
            >
              <Code2 size={17} />
            </button>
            <button
              type="button"
              title="正文"
              aria-label="正文"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => editor.chain().focus().setParagraph().run()}
            >
              <Pilcrow size={16} />
            </button>
            <button
              type="button"
              title="章节标题"
              aria-label="章节标题"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            >
              <Heading2 size={18} />
            </button>
            <button
              type="button"
              title="经历标题"
              aria-label="经历标题"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
            >
              <Heading3 size={18} />
            </button>
            <span className="resume-separator" />
            <button
              type="button"
              aria-label="加粗"
              aria-pressed={selection?.bold}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => editor.chain().focus().toggleBold().run()}
            >
              <Bold size={16} />
            </button>
            <button
              type="button"
              aria-label="斜体"
              aria-pressed={selection?.italic}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => editor.chain().focus().toggleItalic().run()}
            >
              <Italic size={16} />
            </button>
            <button
              type="button"
              aria-label="下划线"
              aria-pressed={selection?.underline}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => editor.chain().focus().toggleUnderline().run()}
            >
              <Underline size={16} />
            </button>
            <button
              type="button"
              aria-label="无序列表"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => editor.chain().focus().toggleBulletList().run()}
            >
              <List size={17} />
            </button>
            <button
              type="button"
              aria-label="有序列表"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => editor.chain().focus().toggleOrderedList().run()}
            >
              <ListOrdered size={17} />
            </button>
            <span className="resume-separator" />
            {marks.map(({ action, label, className }) => (
              <button
                type="button"
                key={action}
                title={label}
                aria-label={label}
                className={className}
                disabled={!selection?.selected}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => applyMark(editor, action)}
              >
                {action === 'highlight' ? (
                  <Highlighter size={16} />
                ) : action === 'clear' ? (
                  <Eraser size={16} />
                ) : (
                  <span className="resume-color-letter">A</span>
                )}
              </button>
            ))}
            <span className="resume-separator" />
            <button
              type="button"
              title="添加评论"
              aria-label="添加评论"
              disabled={!selection?.selected}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => startComment()}
            >
              <MessageSquarePlus size={17} />
            </button>
            <span className="resume-separator" />
            <button
              type="button"
              aria-label="撤销"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => editor.chain().focus().undo().run()}
            >
              <Undo2 size={16} />
            </button>
            <button
              type="button"
              aria-label="重做"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => editor.chain().focus().redo().run()}
            >
              <Redo2 size={16} />
            </button>
          </div>
        )}
        <div
          hidden={mode === 'markdown'}
          className={`resume-paper ${readonly ? 'is-preview' : ''}`}
          onClick={(event) => {
            const target = event.target instanceof Element ? event.target.closest(`[${COMMENT_ATTR}]`) : null;
            const ids = commentIds(target?.getAttribute(COMMENT_ATTR) ?? null).filter((id) =>
              state.comments?.some((comment) => comment.id === id),
            );
            if (ids.length) setActive(ids[(ids.indexOf(active ?? '') + 1) % ids.length]);
          }}
          onContextMenu={(event) => {
            if (openMenu(event.clientX, event.clientY)) event.preventDefault();
          }}
          onKeyDown={(event) => {
            if (editor && (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10'))) {
              const bounds = editor.view.coordsAtPos(editor.state.selection.from);
              if (openMenu(bounds.left, bounds.bottom)) event.preventDefault();
            }
          }}
        >
          <EditorContent editor={editor} />
        </div>
      </div>
      <ResumeComments
        label={commentsLabel}
        comments={state.comments ?? []}
        anchors={selection?.anchors ?? []}
        active={active}
        draft={draft}
        editable={!readonly}
        onDraft={(body) => setDraft((previous) => (previous ? { ...previous, body } : null))}
        onSubmit={submitComment}
        onCancel={() => {
          setDraft(null);
          draftRange.current = null;
          onError('');
        }}
        onLocate={locate}
        onEditMode={() => onModeChange('edit')}
        onEdit={(comment) => {
          if (draft && !window.confirm('放弃当前未提交的评论？')) return;
          setDraft({ ...comment });
          setActive(comment.id);
          onError('');
        }}
        onDelete={(id) => {
          if (!editor || !window.confirm('删除这条评论？正文将保留。')) return;
          try {
            commitComments(
              (currentState.current.comments ?? []).filter((comment) => comment.id !== id),
              removeCommentAnchor(editor.state, id),
            );
            if (draft?.id === id) setDraft(null);
            if (active === id) setActive(null);
          } catch (error) {
            onError(error instanceof Error ? error.message : '删除失败，请重试。');
          }
        }}
      />
      {menu &&
        editor &&
        createPortal(
          <div
            ref={menuRef}
            className="resume-page resume-context-menu"
            role="menu"
            aria-label="选中文字格式"
            style={{ left: menu.x, top: menu.y }}
            onKeyDown={(event) => {
              const buttons = Array.from(menuRef.current?.querySelectorAll('button') ?? []);
              const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
              if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault();
                buttons[(index + (event.key === 'ArrowDown' ? 1 : buttons.length - 1)) % buttons.length]?.focus();
              }
              if (event.key === 'Escape' || event.key === 'Tab') {
                event.preventDefault();
                event.stopPropagation();
                setMenu(null);
                editor.chain().focus().setTextSelection(menu).run();
              }
            }}
          >
            <button type="button" role="menuitem" onClick={() => startComment(menu)}>
              <MessageSquarePlus size={18} />
              添加评论
            </button>
            {marks.map(({ action, label, className }) => (
              <button
                type="button"
                key={action}
                role="menuitem"
                className={className}
                onClick={() => {
                  applyMark(editor, action, menu);
                  setMenu(null);
                }}
              >
                <span aria-hidden="true">{action === 'highlight' ? '▰' : action === 'clear' ? '↺' : 'A'}</span>
                {label}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}
