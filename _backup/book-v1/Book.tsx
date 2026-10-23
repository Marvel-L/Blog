import { useMemo, type CSSProperties } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, ArrowUpRight, BookOpen, Library } from 'lucide-react';
import { Seo } from '@/components/Seo';
import { getInitialPosts } from '@/services/posts';
import { buildBooks, bookPath, chapterPath, type Book } from '@/books/books-core.mjs';
import { BookTree } from '@/books/BookTree';
import { NotFound } from './NotFound';

const bookStyle = (book: Book): CSSProperties => ({ '--book-accent': book.accent }) as CSSProperties;

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
          MARVEL'S LIBRARY <span>{book.posts.length} 篇</span>
        </span>
      </span>
    </span>
  );
}

export function BookPage() {
  const { bookId, postId } = useParams<{ bookId: string; postId: string }>();
  // Public metadata only: no full Markdown import, requests, clock or random values.
  const books = useMemo(() => buildBooks(getInitialPosts()), []);
  const total = books.reduce((sum, book) => sum + book.posts.length, 0);
  if (!bookId) {
    return (
      <div className="book-app book-library">
        <Seo
          title="Book · 我的分类书架"
          description="把文章收进一本本书里。从算法、Golang 到日常记录，按分类与章节目录重新发现博客内容。"
        />
        <header className="book-library-header">
          <div>
            <p className="book-eyebrow">
              <Library size={14} aria-hidden="true" /> A PERSONAL LIBRARY
            </p>
            <h1>
              把零散的思考，
              <br />
              <em>读成一本书。</em>
            </h1>
            <p className="book-library-intro">
              有些知识适合查找，有些故事值得重读。
              <br />
              选一本感兴趣的书，从一个章节开始。
            </p>
          </div>
          <div className="book-library-index">
            <span>THE COLLECTION</span>
            <strong>{String(books.length).padStart(2, '0')}</strong>
            <span>本分类书 · {total} 篇文章</span>
          </div>
        </header>
        {books.length ? (
          <section aria-label="分类书架" className="book-shelf">
            {books.map((book, index) => (
              <Link
                className="book-shelf-item"
                to={bookPath(book.id)}
                key={book.id}
                aria-label={`打开 ${book.name}，${book.posts.length} 篇文章`}
              >
                <span className="book-shelf-volume">
                  <BookCover book={book} number={index + 1} />
                </span>
                <span className="book-shelf-label">
                  <span>
                    {book.name}
                    <small>{book.posts.length} 篇文章</small>
                  </span>
                  <ArrowUpRight size={19} aria-hidden="true" />
                </span>
              </Link>
            ))}
          </section>
        ) : (
          <p className="book-empty">书架还空着，发布第一篇文章后会自动出现在这里。</p>
        )}
        <p className="book-library-note">
          <BookOpen size={14} aria-hidden="true" /> 每本书是一个分类，每一篇文章是其中一章。
        </p>
      </div>
    );
  }
  const book = books.find((item) => item.id === bookId);
  const selected = postId ? book?.posts.find((post) => post.id === postId) : undefined;
  if (!book || (postId && !selected)) return <NotFound />;
  const index = books.indexOf(book);
  const chapterIndex = selected ? book.posts.indexOf(selected) : -1;
  const previous = chapterIndex > 0 ? book.posts[chapterIndex - 1] : undefined;
  const next = selected ? book.posts[chapterIndex + 1] : undefined;
  return (
    <div className="book-app book-reader" style={bookStyle(book)}>
      <Seo
        title={selected ? `${selected.title} · ${book.name}章节预览` : `${book.name} · 分类书籍预览`}
        description={selected?.excerpt || `${book.subtitle}。浏览 ${book.posts.length} 篇文章，按章节目录逐步阅读。`}
        noindex={Boolean(selected)}
      />
      <div className="book-reader-topline">
        <Link to="/book">
          <ArrowLeft size={15} aria-hidden="true" /> 返回书架
        </Link>
        <span>BOOK / {book.name}</span>
      </div>
      <nav className="book-category-nav" aria-label="书籍分类">
        {books.map((item) => (
          <Link key={item.id} to={bookPath(item.id)} aria-current={item.id === book.id ? 'page' : undefined}>
            {item.name}
            <span>{item.posts.length}</span>
          </Link>
        ))}
      </nav>
      <div className="book-reader-layout">
        <aside className="book-sidebar">
          <details open>
            <summary className="book-sidebar-heading">
              <span>目录</span>
              <small>{book.posts.length} 章 · 收起 / 展开</small>
            </summary>
            <nav aria-label={`${book.name}章节目录`}>
              <Link className="book-overview-link" to={bookPath(book.id)} aria-current={!selected ? 'page' : undefined}>
                <BookOpen size={15} aria-hidden="true" /> 本书概览
              </Link>
              <BookTree tree={book.tree} bookId={book.id} selectedId={selected?.id} />
            </nav>
          </details>
        </aside>
        <section className="book-reading-pane" aria-label="书籍预览">
          {selected ? (
            <article className="book-chapter-preview" key={selected.id}>
              <p className="book-eyebrow">
                CHAPTER {String(chapterIndex + 1).padStart(2, '0')} / {String(book.posts.length).padStart(2, '0')}
              </p>
              <h1>{selected.title}</h1>
              <div className="book-chapter-meta">
                <time dateTime={selected.date}>{selected.date}</time>
                <span>{selected.readTime}</span>
                {selected.tbd && <span>持续更新</span>}
              </div>
              <div className="book-chapter-excerpt">
                <h2>章节摘要</h2>
                <p>{selected.excerpt}</p>
              </div>
              <div className="book-chapter-tags">
                {selected.tags.map((tag) => (
                  <span key={tag}>{tag}</span>
                ))}
              </div>
              <Link className="book-primary-link" to={`/post/${encodeURIComponent(selected.id)}`}>
                阅读完整文章 <ArrowUpRight size={17} aria-hidden="true" />
              </Link>
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
          ) : (
            <>
              <div className="book-overview-hero">
                <div>
                  <p className="book-eyebrow">VOLUME {String(index + 1).padStart(2, '0')} / CATEGORY</p>
                  <h1>{book.name}</h1>
                  <p>{book.subtitle}</p>
                  <span className="book-overview-count">{book.posts.length} 个章节，按自己的节奏阅读。</span>
                  <Link className="book-primary-link" to={chapterPath(book.id, book.posts[0].id)}>
                    开始阅读 <ArrowRight size={16} aria-hidden="true" />
                  </Link>
                </div>
                <BookCover book={book} number={index + 1} small />
              </div>
              <div className="book-chapter-list-heading">
                <h2>书中章节</h2>
                <span>CONTENTS</span>
              </div>
              <ol className="book-chapter-list">
                {book.posts.map((post, chapter) => (
                  <li key={post.id}>
                    <Link to={chapterPath(book.id, post.id)}>
                      <span className="book-chapter-number">{String(chapter + 1).padStart(2, '0')}</span>
                      <span>
                        <strong>{post.title}</strong>
                        <small>{post.excerpt}</small>
                      </span>
                      <ArrowUpRight size={17} aria-hidden="true" />
                    </Link>
                  </li>
                ))}
              </ol>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
