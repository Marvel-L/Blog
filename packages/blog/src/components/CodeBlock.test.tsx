import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderToString } from 'react-dom/server';
import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import { remarkPostBasePlugins } from '@/utils/markdownPlugins';
import { copyTextToClipboard } from '@/utils/clipboard';
import { downloadBlob } from '@/utils/download';
import { CodeBlock, MarkdownCode } from './CodeBlock';

vi.mock('@/utils/clipboard', () => ({ copyTextToClipboard: vi.fn() }));
vi.mock('@/utils/download', () => ({ downloadBlob: vi.fn() }));

const markdown = (content: string) => (
  <ReactMarkdown
    remarkPlugins={remarkPostBasePlugins}
    rehypePlugins={[rehypeHighlight]}
    components={{ pre: CodeBlock, code: MarkdownCode }}
  >
    {content}
  </ReactMarkdown>
);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(copyTextToClipboard).mockResolvedValue(true);
});

describe('shared Markdown code blocks', () => {
  it('copies and downloads source text without highlighted markup or line numbers', async () => {
    const source = 'func main() {\n    println("<script>example</script>")\n}';
    const user = userEvent.setup();
    const { container } = render(markdown(`\`\`\`go title="main.go"\n${source}\n\`\`\``));
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('.hljs-keyword')).toHaveTextContent('func');
    expect(screen.getByText('main.go')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '复制代码' }));
    expect(copyTextToClipboard).toHaveBeenCalledWith(source);
    expect(screen.getByRole('status')).toHaveTextContent('代码已复制');
    await user.click(screen.getByRole('button', { name: '下载代码' }));
    expect(downloadBlob).toHaveBeenCalledWith(expect.any(Blob), 'main.go');
    const blob = vi.mocked(downloadBlob).mock.calls[0][0];
    expect(blob.type).toBe('text/plain;charset=utf-8');
    expect(
      await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.readAsText(blob);
      }),
    ).toBe(source);
  });

  it('copies an individual line without changing the code', async () => {
    const source = 'first line\n    second line';
    render(markdown(`\`\`\`\n${source}\n\`\`\``));
    fireEvent.click(screen.getByTitle('复制第 2 行'));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('已复制第 2 行'));
    expect(copyTextToClipboard).toHaveBeenCalledWith('    second line');
    expect(document.querySelector('pre code')).toHaveTextContent('first line');
  });

  it.each(['```\nplain text\n```', '    indented code'])(
    'keeps untagged code separate from inline code: %s',
    (fence) => {
      const { container } = render(markdown(`行内 \`value\`。\n\n${fence}`));
      expect(container.querySelector('p code')).toHaveClass('font-mono');
      const block = container.querySelector('pre code')!;
      expect(block).toHaveAttribute('data-block-code', 'true');
      expect(block).not.toHaveClass('font-medium');
      expect(screen.getByLabelText('代码语言：纯文本')).toBeInTheDocument();
    },
  );

  it('preserves source whitespace when wrapping is toggled', async () => {
    const source = 'one line\n    next line';
    const user = userEvent.setup();
    const { container } = render(markdown(`\`\`\`\n${source}\n\`\`\``));
    const code = container.querySelector('pre code')!;
    await user.click(screen.getByRole('button', { name: '开启自动换行' }));
    expect(container.querySelector('.code-block')).toHaveAttribute('data-wrapped', 'true');
    expect(screen.getByRole('button', { name: '关闭自动换行' })).toHaveAttribute('aria-pressed', 'true');
    expect(code.textContent).toBe(`${source}\n`);
    await user.click(screen.getByRole('button', { name: '关闭自动换行' }));
    expect(container.querySelector('.code-block')).not.toHaveAttribute('data-wrapped');
    expect(container.querySelector('pre code')).toBe(code);
  });

  it('collapses large snippets in SSR and allows expansion and collapse in the client', async () => {
    const source = Array.from({ length: 75 }, (_, index) => `line ${index + 1}`).join('\n');
    const content = markdown(`\`\`\`\n${source}\n\`\`\``);
    const html = renderToString(content);
    expect(html).toContain('code-block-collapsed');
    expect(html.match(/data-line="/g)).toHaveLength(30);
    expect(html).toContain('line 75');
    const user = userEvent.setup();
    const { container } = render(content);
    await user.click(screen.getByRole('button', { name: '展开完整代码' }));
    expect(container.querySelectorAll('.code-line-numbers span')).toHaveLength(75);
    expect(container.querySelector('.code-scroll')).toHaveClass('code-block-expanded');
    await user.click(screen.getByRole('button', { name: '折叠代码' }));
    expect(container.querySelectorAll('.code-line-numbers span')).toHaveLength(30);
    expect(container.querySelector('.code-scroll')).toHaveClass('code-block-collapsed');
  });
});
