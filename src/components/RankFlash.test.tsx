import { describe, expect, it, vi, afterEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { FlashCover, onFlashPointerLeave, onFlashPointerMove, PostRankFrame } from './RankFlash';

describe('RankFlash', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('未分级时不渲染徽标与闪卡表面', () => {
    const { container } = render(
      <PostRankFrame>
        <h1>普通标题</h1>
      </PostRankFrame>,
    );
    expect(screen.getByRole('heading', { name: '普通标题' })).toBeInTheDocument();
    expect(screen.queryByText('文章分级：')).not.toBeInTheDocument();
    expect(container.querySelector('.flash-surface')).toBeNull();
  });

  it('分级标题框展示对应段位，专注阅读去掉流动描边', () => {
    const { rerender } = render(
      <PostRankFrame rank="钻石">
        <h1>分级标题</h1>
      </PostRankFrame>,
    );
    expect(screen.getByText('钻石')).toBeInTheDocument();
    expect(document.querySelector('.flash-surface--frame')).toBeInTheDocument();

    rerender(
      <PostRankFrame rank="钻石" quiet>
        <h1>分级标题</h1>
      </PostRankFrame>,
    );
    expect(screen.getByText('钻石')).toBeInTheDocument();
    expect(document.querySelector('.flash-surface--frame')).not.toBeInTheDocument();
  });

  it('非法分级按普通文章处理', () => {
    render(
      <FlashCover rank="传说" className="cover">
        <img alt="封面" />
      </FlashCover>,
    );
    expect(screen.getByRole('img', { name: '封面' })).toBeInTheDocument();
    expect(document.querySelector('.flash-cover-sheen')).toBeNull();
  });

  it('指针移动写入闪光位置，离开后清除', () => {
    const { container } = render(<div onPointerMove={onFlashPointerMove} onPointerLeave={onFlashPointerLeave} />);
    const el = container.firstElementChild as HTMLElement;
    el.getBoundingClientRect = () =>
      ({
        width: 200,
        height: 100,
        left: 10,
        top: 20,
        right: 210,
        bottom: 120,
        x: 10,
        y: 20,
        toJSON: () => ({}),
      }) as DOMRect;

    fireEvent.pointerMove(el, { clientX: 110, clientY: 70 });
    expect(el.style.getPropertyValue('--flash-x')).toBe('50.00%');
    expect(el.style.getPropertyValue('--flash-y')).toBe('50.00%');

    fireEvent.pointerLeave(el);
    expect(el.style.getPropertyValue('--flash-x')).toBe('');
    expect(el.style.getPropertyValue('--flash-y')).toBe('');
  });

  it('减少动效时不跟随指针', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: true })),
    );
    const { container } = render(<div onPointerMove={onFlashPointerMove} />);
    const el = container.firstElementChild as HTMLElement;
    el.getBoundingClientRect = () =>
      ({
        width: 200,
        height: 100,
        left: 0,
        top: 0,
        right: 200,
        bottom: 100,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;

    fireEvent.pointerMove(el, { clientX: 100, clientY: 50 });
    expect(el.style.getPropertyValue('--flash-x')).toBe('');
  });
});
