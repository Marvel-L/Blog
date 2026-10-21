import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearPrivacyAccess,
  grantPrivacyAccess,
  readPrivacyAccess,
  readPrivacySessionPassword,
  verifyPrivacyPassword,
} from './privacyAccess';

describe('privacyAccess', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    window.localStorage.clear();
  });

  it('密码验证只接受预设口令', () => {
    expect(verifyPrivacyPassword('Mx179516')).toBe(true);
    expect(verifyPrivacyPassword('mx179516')).toBe(false);
    expect(verifyPrivacyPassword('')).toBe(false);
  });

  it('可读写访问状态，并在刷新后继续保留', () => {
    expect(readPrivacyAccess()).toBe(false);
    expect(readPrivacySessionPassword()).toBe(null);

    grantPrivacyAccess('Mx179516');
    expect(readPrivacyAccess()).toBe(true);
    expect(readPrivacySessionPassword()).toBe('Mx179516');
    expect(window.localStorage.getItem('d-blog-privacy-access')).toBe('granted');
    expect(window.localStorage.getItem('d-blog-privacy-password')).toBe('Mx179516');

    clearPrivacyAccess();
    expect(readPrivacyAccess()).toBe(false);
    expect(readPrivacySessionPassword()).toBe(null);
  });

  it('兼容读取旧的 sessionStorage 状态', () => {
    window.sessionStorage.setItem('d-blog-privacy-access', 'granted');
    window.sessionStorage.setItem('d-blog-privacy-password', 'Mx179516');

    expect(readPrivacyAccess()).toBe(true);
    expect(readPrivacySessionPassword()).toBe('Mx179516');
  });
});
