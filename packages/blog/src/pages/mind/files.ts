import { MAX_NODES, parseMindState, type MindNode, type MindState } from './model';

export type MindFileFormat = 'json' | 'markdown';
export const MAX_MIND_FILE_BYTES = 2 * 1024 * 1024;

const keys = (value: object, allowed: string[], path: string) => {
  const extra = Object.keys(value).find((key) => !allowed.includes(key));
  if (extra) throw new Error(`${path} 不支持字段“${extra}”`);
};

/** Keep the portable document identical to the API schema, without account or revision metadata. */
export function parseMindJson(source: string): MindState {
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch {
    throw new Error('JSON 语法错误，请检查引号、逗号与括号');
  }
  const state = parseMindState(value);
  if (!state)
    throw new Error(
      '导图结构无效：需要 version: 1、有效标题、唯一根节点和父节点引用；最多 1000 个节点、32 层、每节点 200 字',
    );
  keys(state, ['version', 'title', 'layout', 'nodes', 'viewport'], '导图');
  keys(state.viewport, ['x', 'y', 'zoom'], 'viewport');
  state.nodes.forEach((node, index) =>
    keys(node, ['id', 'parentId', 'text', 'emoji', 'side', 'color'], `nodes[${index}]`),
  );
  return state;
}

// This is a deliberately small Markdown outline dialect. Labels are plain text;
// no HTML, links or code are rendered or executed during import.
const escapeLabel = (text: string) =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\t/g, '&#9;')
    .replace(/\r/g, '&#13;')
    .replace(/[\\`*_{}[\]()#+.!|~-]/g, '\\$&')
    .split('\n')
    .map((line) => line.replace(/^ +| +$/g, (spaces) => '&#32;'.repeat(spaces.length)))
    .join('<br />');

const unescapeLabel = (text: string) =>
  text
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/\\([\\`*_{}[\]()#+.!|~-])/g, '$1')
    .replace(/&(amp|lt|gt|#9|#13|#32);/g, (_, entity: string) => {
      const entities: Record<string, string> = { amp: '&', lt: '<', gt: '>', '#9': '\t', '#13': '\r', '#32': ' ' };
      return entities[entity];
    });

export function serializeMindFile(state: MindState, format: MindFileFormat): string {
  if (format === 'json') return `${JSON.stringify(state, null, 2)}\n`;
  const children = new Map<string | null, MindNode[]>();
  for (const node of state.nodes) children.set(node.parentId, [...(children.get(node.parentId) ?? []), node]);
  const lines = [`# ${escapeLabel(state.title)}`, ''];
  const visit = (node: MindNode, depth: number) => {
    lines.push(`${'  '.repeat(depth)}- ${escapeLabel(node.text)}`);
    for (const child of children.get(node.id) ?? []) visit(child, depth + 1);
  };
  visit(children.get(null)![0], 0);
  return `${lines.join('\n')}\n`;
}

export function parseMindMarkdown(source: string): MindState {
  let title = '';
  const entries: { depth: number; text: string; line: number }[] = [];
  source.split('\n').forEach((raw, index) => {
    const line = raw.replace(/\r$/, '');
    if (!line.trim()) return;
    if (!entries.length && !title && /^# /.test(line)) {
      title = unescapeLabel(line.slice(2));
      return;
    }
    const match = /^( *)(?:-|\*|\+) (.*)$/.exec(line);
    if (!match || match[1].length % 2)
      throw new Error(`第 ${index + 1} 行：请使用“- 主题”列表，每层缩进两个空格；标题使用“# 名称”`);
    entries.push({ depth: match[1].length / 2, text: unescapeLabel(match[2]), line: index + 1 });
    if (entries.length > MAX_NODES) throw new Error('最多支持 1000 个节点');
  });
  if (!entries.length) throw new Error('Markdown 中没有主题，请添加“- 中心主题”及其缩进子主题');
  if (entries[0].depth !== 0) throw new Error(`第 ${entries[0].line} 行：首个主题不能缩进`);
  title ||= entries[0].text.trim() || '未命名导图';
  // Multiple top-level bullets are useful when pasting an ordinary outline.
  const multipleRoots = entries.filter((entry) => entry.depth === 0).length > 1;
  const nodes: MindNode[] = [];
  const parents: MindNode[] = [];
  if (multipleRoots) {
    const root: MindNode = { id: crypto.randomUUID(), parentId: null, text: title, emoji: '', side: 1 };
    nodes.push(root);
    parents.push(root);
  }
  let rootChildren = 0;
  for (const entry of entries) {
    const depth = entry.depth + (multipleRoots ? 1 : 0);
    if (depth > 32 || (depth && !parents[depth - 1]))
      throw new Error(`第 ${entry.line} 行：缩进不能跳层，且不能超过 32 层`);
    const parent = depth ? parents[depth - 1] : null;
    const side = !parent ? 1 : parent.parentId === null ? (rootChildren++ % 2 ? -1 : 1) : parent.side;
    const node: MindNode = { id: crypto.randomUUID(), parentId: parent?.id ?? null, text: entry.text, emoji: '', side };
    nodes.push(node);
    parents[depth] = node;
    parents.length = depth + 1;
  }
  const state: MindState = { version: 1, title, layout: 'mind', nodes, viewport: { x: 0, y: 0, zoom: 1 } };
  if (!parseMindState(state))
    throw new Error('大纲超出导图限制：标题最多 120 字、节点最多 200 字、总数最多 1000；标题不能为空');
  return state;
}

export function parseMindFile(source: string, format: MindFileFormat): MindState {
  if (new TextEncoder().encode(source).length > MAX_MIND_FILE_BYTES) throw new Error('文件不能超过 2 MiB');
  const clean = source.replace(/^\uFEFF/, '');
  return format === 'json' ? parseMindJson(clean) : parseMindMarkdown(clean);
}

export function mindFileName(title: string, format: MindFileFormat): string {
  const safeTitle = Array.from(title)
    .map((char) => (char.codePointAt(0)! < 32 || /[<>:"/\\|?*]/.test(char) ? '_' : char))
    .join('')
    .trim();
  const name = Array.from(safeTitle).slice(0, 80).join('') || 'mind';
  return `${name}.${format === 'json' ? 'json' : 'md'}`;
}

export function downloadMindFile(state: MindState, format: MindFileFormat) {
  const blob = new Blob([serializeMindFile(state, format)], {
    type: format === 'json' ? 'application/json;charset=utf-8' : 'text/markdown;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  try {
    anchor.href = url;
    anchor.download = mindFileName(state.title, format);
    document.body.appendChild(anchor);
    anchor.click();
  } finally {
    anchor.remove();
    // Allow the browser to start the download before releasing its URL.
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
