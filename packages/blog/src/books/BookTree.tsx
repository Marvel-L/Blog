import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, FileText, Folder } from 'lucide-react';
import { chapterPath, type BookNode } from './books-core.mjs';

const containsChapter = (node: BookNode, chapterId?: string): boolean =>
  Boolean(chapterId) &&
  (node.chapter?.id === chapterId || node.children.some((child) => containsChapter(child, chapterId)));

function Branch({ node, bookId, selectedId }: { node: BookNode; bookId: string; selectedId?: string }) {
  const [open, setOpen] = useState(true);
  if (node.chapter) {
    return (
      <li className="book-tree-leaf">
        <Link
          to={chapterPath(bookId, node.chapter.id)}
          aria-current={node.chapter.id === selectedId ? 'page' : undefined}
        >
          <FileText size={14} aria-hidden="true" />
          <span>{node.label}</span>
        </Link>
      </li>
    );
  }
  return (
    <li className="book-tree-folder">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className={containsChapter(node, selectedId) ? 'book-tree-current-group' : undefined}
      >
        <ChevronDown size={14} aria-hidden="true" className={open ? '' : 'book-tree-collapsed'} />
        <Folder size={14} aria-hidden="true" />
        <span>{node.label}</span>
      </button>
      <ul hidden={!open}>
        {node.children.map((child) => (
          <Branch key={child.id} node={child} bookId={bookId} selectedId={selectedId} />
        ))}
      </ul>
    </li>
  );
}

export function BookTree({ tree, bookId, selectedId }: { tree: BookNode[]; bookId: string; selectedId?: string }) {
  return (
    <ul className="book-tree">
      {tree.map((node) => (
        <Branch key={node.id} node={node} bookId={bookId} selectedId={selectedId} />
      ))}
    </ul>
  );
}
