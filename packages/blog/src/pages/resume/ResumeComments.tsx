import { useEffect, useRef } from 'react';
import { MessageSquare, Pencil, Trash2, X } from 'lucide-react';
import { MAX_COMMENT_BODY, type ResumeComment } from './model';

export interface CommentDraft {
  id?: string;
  quote: string;
  body: string;
}

export default function ResumeComments({
  comments,
  anchors,
  active,
  draft,
  editable,
  onDraft,
  onSubmit,
  onCancel,
  onLocate,
  onEdit,
  onDelete,
  onEditMode,
  label = '定稿评论',
}: {
  comments: ResumeComment[];
  anchors: string[];
  active: string | null;
  draft: CommentDraft | null;
  editable: boolean;
  onDraft: (body: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  onLocate: (id: string) => void;
  onEdit: (comment: ResumeComment) => void;
  onDelete: (id: string) => void;
  onEditMode: () => void;
  label?: string;
}) {
  const input = useRef<HTMLTextAreaElement>(null);
  const panel = useRef<HTMLElement>(null);
  const editing = draft !== null && editable;
  useEffect(() => {
    if (editing) {
      input.current?.focus({ preventScroll: true });
      input.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [editing, draft?.id]);
  useEffect(() => {
    if (active)
      panel.current
        ?.querySelector(`[data-comment-id="${active}"]`)
        ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [active]);
  return (
    <aside ref={panel} className="resume-comments" aria-label={label}>
      <header>
        <MessageSquare size={16} />
        <h2>评论</h2>
        <span>{comments.length}</span>
      </header>
      {editing && (
        <form
          className="resume-comment-draft"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit();
          }}
        >
          <div className="resume-comment-heading">
            <strong>{draft.id ? '编辑评论' : '添加评论'}</strong>
            <button type="button" aria-label="取消评论" onClick={onCancel}>
              <X size={14} />
            </button>
          </div>
          <blockquote>{draft.quote}</blockquote>
          <textarea
            ref={input}
            aria-label="评论内容"
            placeholder="写下修改建议…"
            value={draft.body}
            maxLength={MAX_COMMENT_BODY}
            onChange={(event) => onDraft(event.target.value)}
            onKeyDown={(event) => {
              if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                event.preventDefault();
                onSubmit();
              }
            }}
          />
          <div className="resume-comment-submit">
            <span>
              {[...draft.body].length}/{MAX_COMMENT_BODY}
            </span>
            <button className="resume-button" type="submit" disabled={!draft.body.trim()}>
              {draft.id ? '保存评论' : '提交评论'}
            </button>
          </div>
        </form>
      )}
      {!comments.length && !editing && (
        <p className="resume-comments-empty">选中正文后右键「添加评论」，在这里记录修改建议。</p>
      )}
      {!editable && (
        <button type="button" className="resume-comments-edit" onClick={onEditMode}>
          切换文档编辑以添加或修改评论
        </button>
      )}
      <div className="resume-comment-list">
        {comments.map((comment) => (
          <article
            key={comment.id}
            data-comment-id={comment.id}
            className={`resume-comment ${active === comment.id ? 'is-active' : ''}`}
          >
            <button
              type="button"
              className="resume-comment-quote"
              disabled={!anchors.includes(comment.id)}
              onClick={() => onLocate(comment.id)}
              aria-label={`定位原文：${comment.quote}`}
            >
              <blockquote>{comment.quote}</blockquote>
            </button>
            {!anchors.includes(comment.id) && <p className="resume-comment-missing">原文已删除或标记已移除</p>}
            <p className="resume-comment-body">{comment.body}</p>
            <footer>
              <time dateTime={comment.createdAt}>
                {new Date(comment.createdAt).toLocaleString('zh-CN', {
                  month: 'numeric',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </time>
              {editable && (
                <>
                  <button type="button" aria-label="编辑评论" onClick={() => onEdit(comment)}>
                    <Pencil size={13} />
                  </button>
                  <button type="button" aria-label="删除评论" onClick={() => onDelete(comment.id)}>
                    <Trash2 size={13} />
                  </button>
                </>
              )}
            </footer>
          </article>
        ))}
      </div>
    </aside>
  );
}
