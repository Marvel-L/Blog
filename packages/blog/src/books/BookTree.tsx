import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, FileText, Folder } from 'lucide-react';
import { chapterPath, type BookNode } from './books-core.mjs';

const containsPost = (node: BookNode, postId?: string): boolean =>
  Boolean(postId) && (node.post?.id === postId || node.children.some((child) => containsPost(child, postId)));

function Branch({ node, bookId, selectedId }: { node: BookNode; bookId: string; selectedId?: string }) {
  const [open, setOpen] = useState(true);
  if (node.post) {
    return (
      <li className="book-tree-leaf">
        <Link to={chapterPath(bookId, node.post.id)} aria-current={node.post.id === selectedId ? 'page' : undefined}>
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
        className={containsPost(node, selectedId) ? 'book-tree-current-group' : undefined}
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
