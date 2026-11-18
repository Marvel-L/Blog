import {
  memo,
  type CSSProperties,
  type FocusEvent,
  type KeyboardEvent,
  type PointerEvent,
  type RefObject,
} from 'react';
import { customNodeColors, nodeConnectionY, type DropPlacement, type MindEdge, type PlacedNode } from './model';

export interface MindNodeActions {
  change: (id: string, text: string) => void;
  blur: (event: FocusEvent<HTMLTextAreaElement>) => void;
  keyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  pointerDown: (node: PlacedNode, event: PointerEvent<HTMLButtonElement>) => void;
  click: (id: string) => void;
  doubleClick: (id: string) => void;
  toggle: (id: string) => void;
}

interface Props {
  node: PlacedNode;
  selected: boolean;
  editing: boolean;
  moving: boolean;
  drop: DropPlacement | null;
  editor: RefObject<HTMLTextAreaElement | null>;
  actions: RefObject<MindNodeActions | null>;
}

/** Unchanged nodes keep their props and skip rendering during typing/panning. */
export const MindNodeView = memo(function MindNodeView({
  node,
  selected,
  editing,
  moving,
  drop,
  editor,
  actions,
}: Props) {
  const style = {
    left: node.x - node.width / 2,
    top: node.y - node.height / 2,
    width: node.width,
    minHeight: node.height,
    ...customNodeColors(node.color),
  } as CSSProperties;
  const className = `mind-node mind-branch-${node.branchColor} ${node.color ? 'has-custom-color' : ''} ${node.depth === 0 ? 'mind-root' : node.depth === 1 ? 'mind-primary' : 'mind-topic'} ${node.direction === -1 ? 'mind-left' : ''} ${selected ? 'is-selected' : ''} ${moving ? 'is-moving' : ''} ${drop ? `mind-drop-${drop}` : ''}`;
  return (
    <>
      {editing ? (
        <div data-mind-node={node.id} className={`${className} is-editing`} style={style}>
          {node.emoji && (
            <span className="mind-edit-emoji" aria-hidden="true">
              {node.emoji}
            </span>
          )}
          <textarea
            ref={editor}
            aria-label="编辑节点"
            value={node.text}
            maxLength={200}
            rows={Math.max(1, node.lines.length)}
            wrap="off"
            onChange={(event) => actions.current?.change(node.id, event.target.value)}
            onBlur={(event) => actions.current?.blur(event)}
            onKeyDown={(event) => actions.current?.keyDown(event)}
          />
        </div>
      ) : (
        <button
          data-mind-node={node.id}
          className={className}
          style={style}
          tabIndex={-1}
          aria-pressed={selected}
          aria-label={`节点：${node.text || '未命名主题'}${node.emoji ? ` ${node.emoji}` : ''}`}
          onPointerDown={(event) => actions.current?.pointerDown(node, event)}
          onClick={() => actions.current?.click(node.id)}
          onDoubleClick={() => actions.current?.doubleClick(node.id)}
        >
          <span className="mind-node-content">
            {node.emoji && <span className="mind-node-emoji">{node.emoji} </span>}
            {node.lines.join('\n')}
          </span>
          {drop && (
            <span className="mind-drop-label">
              {drop === 'before' ? '放到上方' : drop === 'after' ? '放到下方' : '作为子主题'}
            </span>
          )}
        </button>
      )}
      {node.childCount > 0 && (
        <button
          type="button"
          data-mind-toggle={node.id}
          className={`mind-branch-toggle mind-branch-${node.branchColor}${moving ? ' is-moving' : ''}`}
          style={
            {
              left: node.x + node.direction * (node.width / 2 + 16) - 14,
              top: nodeConnectionY(node) - 14,
              ...customNodeColors(node.color),
            } as CSSProperties
          }
          aria-label={`${node.collapsed ? '展开' : '收起'}子分支：${node.text || '未命名主题'}`}
          aria-expanded={!node.collapsed}
          title={`${node.collapsed ? '展开' : '收起'} ${node.descendantCount} 个子主题`}
          onPointerDown={(event) => event.stopPropagation()}
          onDoubleClick={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            actions.current?.toggle(node.id);
          }}
        >
          <span aria-hidden="true">{node.collapsed ? '+' : '−'}</span>
        </button>
      )}
    </>
  );
});

export const MindEdgeView = memo(function MindEdgeView({ edge }: { edge: MindEdge }) {
  return (
    <path
      d={edge.d}
      className={`mind-branch-${edge.branchColor}${edge.depth === 1 ? ' mind-primary-edge' : ''}`}
      style={customNodeColors(edge.color)}
    />
  );
});
