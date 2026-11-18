import { describe, expect, it } from 'vitest';
import { MAX_MIND_FILE_BYTES, mindFileName, parseMindFile, serializeMindFile } from './files';
import { newMindState } from './model';

describe('portable mind files', () => {
  it('round trips full JSON state including unordered nodes, markers, colors, layout and viewport', () => {
    const state = newMindState('logic');
    state.title = '数据流程 🚀';
    state.viewport = { x: 48, y: -92, zoom: 1.8 };
    state.nodes.unshift({
      id: crypto.randomUUID(),
      parentId: state.nodes[0].id,
      text: '代码\n`x < 3`',
      emoji: '✅',
      side: -1,
      color: '#AbCeF0',
    });
    expect(parseMindFile(`\uFEFF${serializeMindFile(state, 'json')}`, 'json')).toEqual(state);
    expect(serializeMindFile(state, 'json')).not.toMatch(/userId|revision|mutationId/);
  });
  it('rejects unknown API fields, invalid graphs, syntax and unsupported versions', () => {
    const state = newMindState('mind');
    for (const invalid of [
      { ...state, userId: 'someone' },
      { ...state, version: 2 },
      { ...state, viewport: { ...state.viewport, dangerous: true } },
      { ...state, nodes: [{ ...state.nodes[0], id: 'arbitrary' }] },
      { ...state, nodes: [{ ...state.nodes[0], parentId: state.nodes[0].id }] },
      { ...state, nodes: [{ ...state.nodes[0], extra: true }] },
    ])
      expect(() => parseMindFile(JSON.stringify(invalid), 'json')).toThrow();
    expect(() => parseMindFile('{"version": 1,}', 'json')).toThrow('JSON 语法');
    expect(() => parseMindFile(' '.repeat(MAX_MIND_FILE_BYTES + 1), 'markdown')).toThrow('2 MiB');
  });
  it('round trips Markdown hierarchy, order, plain labels and manual line breaks without interpreting code or HTML', () => {
    const state = newMindState('logic');
    state.title = '  标题 # \\ * \n换行  ';
    state.nodes[0].text = '';
    const child = {
      ...state.nodes[0],
      id: crypto.randomUUID(),
      parentId: state.nodes[0].id,
      text: '  - **粗体** `Go` [link](url) <script>alert(1)</script> &lt; &#32;\t\r\n\n<br />  ',
    };
    state.nodes.unshift(child);
    state.nodes.push({ ...child, id: crypto.randomUUID(), text: '另一分支' });
    state.nodes.push({ ...child, id: crypto.randomUUID(), parentId: child.id, text: '第三层\n✅ 字面文本' });
    const source = serializeMindFile(state, 'markdown');
    const restored = parseMindFile(source, 'markdown');
    expect(restored.title).toBe(state.title);
    expect(restored.nodes.map((node) => node.text)).toEqual(['', child.text, '第三层\n✅ 字面文本', '另一分支']);
    expect(restored.nodes[2].parentId).toBe(restored.nodes[1].id);
    expect(restored.nodes[3].parentId).toBe(restored.nodes[0].id);
    expect(restored.nodes[0].id).not.toBe(state.nodes[0].id);
    expect(restored.layout).toBe('mind');
  });
  it('accepts regular outlines and reports unsupported content, indentation and limits with errors', () => {
    const state = parseMindFile('# 工作计划\n\n- 设计\n  + 页面\n- 实现\n  * 后端\n', 'markdown');
    expect(state.nodes.map((node) => node.text)).toEqual(['工作计划', '设计', '页面', '实现', '后端']);
    expect(state.nodes[4].parentId).toBe(state.nodes[3].id);
    expect(parseMindFile('- 唯一主题', 'markdown').title).toBe('唯一主题');
    for (const source of [
      '',
      '# 标题\n正文',
      '- 根\n   - 三个空格',
      '  - 子主题',
      '- 根\n    - 跳层',
      `- 根\n  - ${'长'.repeat(201)}`,
      `# ${'长'.repeat(121)}\n- 根`,
      Array.from({ length: 34 }, (_, depth) => `${'  '.repeat(depth)}- 节点`).join('\n'),
    ])
      expect(() => parseMindFile(source, 'markdown')).toThrow();
  });
  it('reimports maximum-sized valid Unicode documents and uses safe filenames', () => {
    const state = newMindState('mind');
    state.nodes[0].text = '🚀'.repeat(200);
    for (let index = 1; index < 1000; index++)
      state.nodes.push({
        ...state.nodes[0],
        id: crypto.randomUUID(),
        parentId: state.nodes[0].id,
      });
    for (const format of ['json', 'markdown'] as const)
      expect(parseMindFile(serializeMindFile(state, format), format).nodes).toHaveLength(1000);
    expect(mindFileName('../坏:名字/\n', 'json')).toBe('.._坏_名字__.json');
  });
});
