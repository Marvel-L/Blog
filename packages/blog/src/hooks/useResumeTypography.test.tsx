import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { RESUME_TYPOGRAPHY_KEY, useResumeTypography } from './useResumeTypography';

describe('Resume 排版状态', () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it('非法存储值回退原排版', () => {
    window.localStorage.setItem(RESUME_TYPOGRAPHY_KEY, 'other');
    expect(renderHook(useResumeTypography).result.current.enabled).toBe(false);
  });

  it('存储读取和写入失败时仍可切换', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('读取不可用');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('写入不可用');
    });
    const { result } = renderHook(useResumeTypography);
    expect(result.current.enabled).toBe(false);
    act(() => result.current.toggle());
    expect(result.current.enabled).toBe(true);
    act(() => result.current.toggle());
    expect(result.current.enabled).toBe(false);
  });

  it('SSR 首帧保持原样式且不读取客户端存储', () => {
    window.localStorage.setItem(RESUME_TYPOGRAPHY_KEY, 'true');
    const read = vi.spyOn(Storage.prototype, 'getItem');
    function Probe() {
      const { enabled } = useResumeTypography();
      return <span>{enabled ? 'resume' : 'original'}</span>;
    }
    expect(renderToString(<Probe />)).toBe('<span>original</span>');
    expect(read).not.toHaveBeenCalled();
  });
});
