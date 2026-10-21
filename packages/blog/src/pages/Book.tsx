import { useMemo, type CSSProperties, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import ReactMarkdown, { type Components } from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import { ArrowLeft, ArrowRight, ArrowUpRight, BookOpen, Library, ListTree, Newspaper } from 'lucide-react';
import { Seo } from '@/components/Seo';
import { CompactPostCard } from '@/components/CompactPostCard';
import { getInitialPosts } from '@/services/posts';
import { extractMarkdownHeadings, extractTextFromReactNode, stripInlineMarkdown } from '@/utils/headings';
import { remarkPostBasePlugins } from '@/utils/markdownPlugins';
import {
  buildBooks,
  bookPath,
  chapterPath,
  findLegacyChapter,
  type Book,
  type BookChapter,
} from '@/books/books-core.mjs';
import { BookTree } from '@/books/BookTree';
import { NotFound } from './NotFound';

const bookStyle = (book: Book): CSSProperties => ({ '--book-accent': book.accent }) as CSSProperties;
const withoutLeadingTitle = (content: string) => content.replace(/^\s*#\s+[^\n]+\n+/, '');

function BookCover({ book, number, small = false }: { book: Book; number: number; small?: boolean }) {
  return (
    <span className={`book-object${small ? ' book-object-small' : ''}`} style={bookStyle(book)} aria-hidden="true">
      <span className="book-object-pages" />
      <span className="book-object-spine" />
      <span className="book-object-cover">
        <span className="book-cover-edition">{book.edition}</span>
        <span className="book-cover-number">VOL. {String(number).padStart(2, '0')}</span>
        <span className="book-cover-title">{book.name}</span>
        <span className="book-cover-line" />
        <span className="book-cover-caption">{book.subtitle}</span>
        <span className="book-cover-footer">
          MARVEL&apos;S LIBRARY <span>{book.chapters.length} 章</span>
        </span>
      </span>
    </span>
  );
}

const createMarkdownComponents = (headings: ReturnType<typeof extractMarkdownHeadings>): Components => {
  let cursor = 0;
  const heading = (level: 2 | 3) =>
    function BookHeading({ children }: { children?: ReactNode }) {
      const text = stripInlineMarkdown(extractTextFromReactNode(children));
      const match = headings.slice(cursor).find((item) => item.level === level && item.rawText === text);
      if (match) cursor = headings.indexOf(match) + 1;
      const Tag = `h${level}` as const;
      return <Tag id={match?.id}>{children}</Tag>;
    };
  return {
    h2: heading(2),
    h3: heading(3),
    a: ({ href, children }) => {
      if (!href) return <span>{children}</span>;
      if (href.startsWith('/')) return <Link to={href}>{children}</Link>;
      return (
        <a href={href} rel="noreferrer" target="_blank">
          {children}
        </a>
      );
    },
  };
};

function RelatedReading({ chapter }: { chapter: BookChapter }) {
  if (!chapter.relatedPosts.length) return null;
  return (
    <section className="book-related" aria-labelledby="book-related-heading">
      <div className="book-related-heading">
        <Newspaper size={16} aria-hidden="true" />
        <div>
          <p>RELATED BLOG POSTS</p>
          <h2 id="book-related-heading">你可能还喜欢</h2>
        </div>
      </div>
      <div className="book-related-grid">
        {chapter.relatedPosts.slice(0, 3).map((post) => (
          <CompactPostCard key={post.id} post={post} />
        ))}
      </div>
    </section>
  );
}

function ChapterArticle({ book, chapter }: { book: Book; chapter: BookChapter }) {
  const chapterIndex = book.chapters.indexOf(chapter);
  const previous = chapterIndex > 0 ? book.chapters[chapterIndex - 1] : undefined;
  const next = book.chapters[chapterIndex + 1];
  const body = withoutLeadingTitle(chapter.content);
  const headings = extractMarkdownHeadings(body).filter((item) => item.level >= 2);
  const markdownComponents = createMarkdownComponents(headings);

  return (
    <>
      <article className="book-package-article">
        <header className="book-article-header">
          <p className="book-eyebrow">
            CHAPTER {String(chapterIndex + 1).padStart(2, '0')} / {String(book.chapters.length).padStart(2, '0')}
          </p>
          <h1>{chapter.title}</h1>
          <p>{book.subtitle}</p>
          <div className="book-article-context">
            <span>{chapter.group || '内容'}</span>
            <span>{chapter.relatedPosts.length} 篇关联文章</span>
          </div>
        </header>
        <div className="book-markdown prose max-w-none dark:prose-invert prose-headings:scroll-mt-24">
          <ReactMarkdown
            remarkPlugins={remarkPostBasePlugins}
            rehypePlugins={[rehypeHighlight]}
            components={markdownComponents}
          >
            {body}
          </ReactMarkdown>
        </div>
        <RelatedReading chapter={chapter} />
        <nav className="book-chapter-pagination" aria-label="相邻章节">
          {previous ? (
            <Link to={chapterPath(book.id, previous.id)}>
              <small>上一章</small>
              <span>
                <ArrowLeft size={15} aria-hidden="true" />
                {previous.title}
              </span>
            </Link>
          ) : (
            <span />
          )}
          {next ? (
            <Link to={chapterPath(book.id, next.id)}>
              <small>下一章</small>
              <span>
                {next.title}
                <ArrowRight size={15} aria-hidden="true" />
              </span>
            </Link>
          ) : (
            <span />
          )}
        </nav>
      </article>
      <aside className="book-page-toc" aria-label="本页目录">
        <div className="book-page-toc-title">
          <ListTree size={14} aria-hidden="true" /> 本页目录
        </div>
        {headings.length ? (
          <ol>
            {headings.map((heading) => (
              <li key={heading.id} data-level={heading.level}>
                <a href={`#${heading.id}`}>{heading.text}</a>
              </li>
            ))}
          </ol>
        ) : (
          <p>本章暂无小节</p>
        )}
      </aside>
    </>
  );
}

export function BookPage() {
  const { bookId, chapterId } = useParams<{ bookId: string; chapterId: string }>();
  const books = useMemo(() => buildBooks(getInitialPosts()), []);
  const total = books.reduce((sum, book) => sum + book.chapters.length, 0);

  if (!bookId) {
    return (
      <div className="book-app book-library">
        <Seo
          title="Book · 我的知识包"
          description="由作者独立维护的知识 package：正文形成连续的知识主线，Blog 文章作为案例与延伸阅读按需关联，适合从目录逐章阅读。"
        />
        <header className="book-library-header">
          <div>
            <p className="book-eyebrow">
              <Library size={14} aria-hidden="true" /> PERSONAL PACKAGES
            </p>
            <h1>
              把零散的内容，
              <br />
              <em>整理成一条主线。</em>
            </h1>
            <p className="book-library-intro">
              每本 Book 都是一份独立维护的 package。
              <br />
              正文负责讲清知识，Blog 文章作为延伸阅读。
            </p>
          </div>
          <div className="book-library-index">
            <span>THE COLLECTION</span>
            <strong>{String(books.length).padStart(2, '0')}</strong>
            <span>{total} 个 package 章节</span>
          </div>
        </header>
        {books.length ? (
          <section aria-label="知识包书架" className="book-shelf">
            {books.map((book, index) => (
              <Link
                className="book-shelf-item"
                to={bookPath(book.id)}
                key={book.id}
                aria-label={`打开 ${book.name}，${book.chapters.length} 个章节`}
              >
                <span className="book-shelf-volume">
                  <BookCover book={book} number={index + 1} />
                </span>
                <span className="book-shelf-label">
                  <span>
                    {book.name}
                    <small>
                      {book.chapters.length} 个章节 · {book.posts.length} 篇关联文章
                    </small>
                  </span>
                  <ArrowUpRight size={19} aria-hidden="true" />
                </span>
              </Link>
            ))}
          </section>
        ) : (
          <p className="book-empty">书架还空着，在 Book package 配置中添加第一本书后会显示在这里。</p>
        )}
        <p className="book-library-note">
          <BookOpen size={14} aria-hidden="true" /> Book 独立于 Category，内容与 Blog 文章按需关联。
        </p>
      </div>
    );
  }

  const book = books.find((item) => item.id === bookId);
  if (!book) return <NotFound />;
  const selected = chapterId
    ? book.chapters.find((chapter) => chapter.id === chapterId) || findLegacyChapter(book, chapterId)
    : book.chapters[0];
  if (chapterId && !selected) return <NotFound />;
  const index = books.indexOf(book);

  return (
    <div className="book-app book-reader" style={bookStyle(book)}>
      <Seo
        title={selected ? `${selected.title} · ${book.name}` : `${book.name} · Book`}
        description={`${book.subtitle} 当前章节为“${selected?.title || book.name}”，正文按 package 目录组织，并在章节末尾提供相关 Blog 文章作为案例与延伸阅读。`}
      />
      <div className="book-reader-topline">
        <Link to="/book">
          <ArrowLeft size={15} aria-hidden="true" /> 返回书架
        </Link>
        <span>PACKAGE / {book.name}</span>
      </div>
      <nav className="book-category-nav" aria-label="Book packages">
        {books.map((item) => (
          <Link key={item.id} to={bookPath(item.id)} aria-current={item.id === book.id ? 'page' : undefined}>
            {item.name}
            <span>{item.chapters.length}</span>
          </Link>
        ))}
      </nav>
      <section className="book-package-banner">
        <div>
          <p className="book-eyebrow">VOLUME {String(index + 1).padStart(2, '0')} / PACKAGE</p>
          <h2>{book.name}</h2>
          <p>{book.subtitle}</p>
        </div>
        <BookCover book={book} number={index + 1} small />
      </section>
      {selected ? (
        <div className="book-reader-layout">
          <aside className="book-sidebar">
            <details open>
              <summary className="book-sidebar-heading">
                <span>Package 目录</span>
                <small>{book.chapters.length} 章 · 收起 / 展开</small>
              </summary>
              <nav aria-label={`${book.name}章节目录`}>
                <BookTree tree={book.tree} bookId={book.id} selectedId={selected.id} />
              </nav>
            </details>
          </aside>
          <section className="book-reading-pane" aria-label={`${book.name}内容`}>
            <ChapterArticle book={book} chapter={selected} />
          </section>
        </div>
      ) : (
        <div className="book-empty-package">
          <BookOpen size={24} aria-hidden="true" />
          <h1>{book.name}</h1>
          <p>这个 package 已创建，但还没有内容。添加章节后正文会显示在这里。</p>
        </div>
      )}
    </div>
  );
}
