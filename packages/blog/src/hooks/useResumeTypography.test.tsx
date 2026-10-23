import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { RESUME_TYPOGRAPHY_KEY, useResumeTypography } from './useResumeTypography';

describe('Resume 排版状态', () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it('没有个人选择时默认开启排版，不自动写入存储', () => {
    expect(renderHook(useResumeTypography).result.current.enabled).toBe(true);
    expect(window.localStorage.getItem(RESUME_TYPOGRAPHY_KEY)).toBeNull();
  });

  it('非法存储值回退默认排版', () => {
    window.localStorage.setItem(RESUME_TYPOGRAPHY_KEY, 'other');
    expect(renderHook(useResumeTypography).result.current.enabled).toBe(true);
  });

  it('关闭排版后重新挂载仍保持关闭，再开启可持久化', () => {
    const first = renderHook(useResumeTypography);
    act(() => first.result.current.toggle());
    expect(window.localStorage.getItem(RESUME_TYPOGRAPHY_KEY)).toBe('false');
    first.unmount();
    const second = renderHook(useResumeTypography);
    expect(second.result.current.enabled).toBe(false);
    act(() => second.result.current.toggle());
    expect(second.result.current.enabled).toBe(true);
    expect(window.localStorage.getItem(RESUME_TYPOGRAPHY_KEY)).toBe('true');
  });

  it('存储读取和写入失败时仍可切换', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('读取不可用');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('写入不可用');
    });
    const { result } = renderHook(useResumeTypography);
    expect(result.current.enabled).toBe(true);
    act(() => result.current.toggle());
    expect(result.current.enabled).toBe(false);
    act(() => result.current.toggle());
    expect(result.current.enabled).toBe(true);
  });

  it('SSR 首帧开启默认排版且不读取客户端存储', () => {
    window.localStorage.setItem(RESUME_TYPOGRAPHY_KEY, 'false');
    const read = vi.spyOn(Storage.prototype, 'getItem');
    function Probe() {
      const { enabled } = useResumeTypography();
      return <span>{enabled ? 'resume' : 'original'}</span>;
    }
    expect(renderToString(<Probe />)).toBe('<span>resume</span>');
    expect(read).not.toHaveBeenCalled();
  });
});
