import { useLayoutEffect, useRef } from 'react';
import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { newMindState, type MindNode, type NodeSize } from './model';
import { useNodeSizes } from './useNodeSizes';

function Sizes({ nodes, report }: { nodes: MindNode[]; report: (sizes: ReadonlyMap<string, NodeSize>) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const sizes = useNodeSizes(nodes, host);
  useLayoutEffect(() => report(sizes), [sizes, report]);
  return <div ref={host} data-testid="measurement-host" />;
}

afterEach(() => {
  cleanup();
  document.documentElement.classList.remove('test-font');
  vi.restoreAllMocks();
});

describe('Mind text measurement', () => {
  it('measures only changed text, preserves size identities and reuses the measuring element', () => {
    const root = { ...newMindState('logic').nodes[0], text: 'Root title' };
    const child = { ...root, id: crypto.randomUUID(), parentId: root.id, text: 'Child title' };
    const measure = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      return { width: (this.textContent?.length ?? 0) * 10 } as DOMRect;
    });
    const report = vi.fn();
    const view = render(<Sizes nodes={[root, child]} report={report} />);
    const initial = report.mock.lastCall![0] as ReadonlyMap<string, NodeSize>;
    const span = view.getByTestId('measurement-host').querySelector('span');
    expect(measure).toHaveBeenCalledTimes(2);
    const updates = report.mock.calls.length;
    view.rerender(<Sizes nodes={[root, { ...child, color: '#123456' }]} report={report} />);
    expect(measure).toHaveBeenCalledTimes(2);
    expect(report).toHaveBeenCalledTimes(updates);
    view.rerender(<Sizes nodes={[root, { ...child, text: 'Changed child title' }]} report={report} />);
    const edited = report.mock.lastCall![0] as ReadonlyMap<string, NodeSize>;
    expect(measure).toHaveBeenCalledTimes(3);
    expect(edited.get(root.id)).toBe(initial.get(root.id));
    expect(edited.get(child.id)!.width).toBeGreaterThan(initial.get(child.id)!.width);
    expect(view.getByTestId('measurement-host').querySelector('span')).toBe(span);
    const resizedUpdates = report.mock.calls.length;
    view.rerender(<Sizes nodes={[root, { ...child, text: 'changed child title' }]} report={report} />);
    expect(measure).toHaveBeenCalledTimes(4);
    expect(report).toHaveBeenCalledTimes(resizedUpdates);
    view.rerender(<Sizes nodes={[root]} report={report} />);
    expect(report.mock.lastCall![0].size).toBe(1);
    expect(report.mock.lastCall![0].get(root.id)).toBe(initial.get(root.id));
    view.unmount();
    expect(span).not.toBeInTheDocument();
  });
  it('invalidates font measurements when page typography changes', async () => {
    const root = { ...newMindState('logic').nodes[0], text: 'Root title' };
    let characterWidth = 10;
    const measure = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      return { width: (this.textContent?.length ?? 0) * characterWidth } as DOMRect;
    });
    const report = vi.fn();
    render(<Sizes nodes={[root]} report={report} />);
    const before = report.mock.lastCall![0].get(root.id)!.width;
    characterWidth = 12;
    document.documentElement.classList.add('test-font');
    await waitFor(() => expect(report.mock.lastCall![0].get(root.id)!.width).toBeGreaterThan(before));
    expect(measure).toHaveBeenCalledTimes(2);
  });
});
