import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RIN_LINES, useRinVoice } from './useRinVoice';

class FakeAudio {
  static players: FakeAudio[] = [];
  onplaying: (() => void) | null = null;
  onpause: (() => void) | null = null;
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  ended = false;
  play = vi.fn(async () => {
    this.onplaying?.();
  });
  pause = vi.fn(() => {
    this.onpause?.();
  });
  constructor(readonly src: string) {
    FakeAudio.players.push(this);
  }
}
let hidden = false;
beforeEach(() => {
  FakeAudio.players = [];
  hidden = false;
  vi.stubGlobal('Audio', FakeAudio);
  vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe('fixed local Rin voices', () => {
  it('plays only the fixed line and stops the old player on next line', () => {
    const hook = renderHook(({ line }) => useRinVoice(line, false), { initialProps: { line: 0 } });
    expect(RIN_LINES[0].text).toBe('你今天想忏悔什么？');
    expect(FakeAudio.players[0].src).toBe(RIN_LINES[0].voice);
    expect(hook.result.current.speaking).toBe(true);
    hook.rerender({ line: 2 });
    expect(FakeAudio.players[0].pause).toHaveBeenCalled();
    expect(FakeAudio.players[1].src).toBe(RIN_LINES[2].voice);
    hook.unmount();
    expect(FakeAudio.players[1].pause).toHaveBeenCalled();
  });
  it('mutes immediately and replays the same fixed clip', () => {
    const hook = renderHook(({ muted }) => useRinVoice(1, muted), { initialProps: { muted: false } });
    hook.rerender({ muted: true });
    expect(hook.result.current.speaking).toBe(false);
    expect(FakeAudio.players[1].play).not.toHaveBeenCalled();
    hook.rerender({ muted: false });
    act(() => hook.result.current.replay());
    expect(FakeAudio.players.at(-1)?.src).toBe(RIN_LINES[1].voice);
  });
  it('pauses in background and resumes only an unfinished line', () => {
    renderHook(() => useRinVoice(0, false));
    const audio = FakeAudio.players[0];
    hidden = true;
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(audio.pause).toHaveBeenCalled();
    hidden = false;
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(audio.play).toHaveBeenCalledTimes(2);
    audio.ended = true;
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(audio.play).toHaveBeenCalledTimes(2);
  });
  it('does not begin playback in a hidden document', () => {
    hidden = true;
    renderHook(() => useRinVoice(0, false));
    expect(FakeAudio.players[0].play).not.toHaveBeenCalled();
  });
  it('reports a loading fault without pretending to speak', () => {
    const hook = renderHook(() => useRinVoice(0, true));
    act(() => FakeAudio.players[0].onerror?.());
    expect(hook.result.current.error).toContain('加载失败');
    expect(hook.result.current.speaking).toBe(false);
  });
});
