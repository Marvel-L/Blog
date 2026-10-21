import { useCallback, useEffect, useState } from 'react';

export const RESUME_TYPOGRAPHY_KEY = 'd-blog-resume-typography';

/** 首帧使用原排版，水合后恢复用户选择；存储不可用时仍能在当前会话切换。 */
export function useResumeTypography() {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    try {
      setEnabled(window.localStorage.getItem(RESUME_TYPOGRAPHY_KEY) === 'true');
    } catch {
      setEnabled(false);
    }
  }, []);

  const toggle = useCallback(() => {
    const next = !enabled;
    setEnabled(next);
    try {
      window.localStorage.setItem(RESUME_TYPOGRAPHY_KEY, String(next));
    } catch {
      // 写入失败不影响本次切换；不承诺刷新后仍保留选择。
    }
  }, [enabled]);

  return { enabled, toggle };
}
