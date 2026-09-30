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
  });

  it('密码验证只接受预设口令', () => {
    expect(verifyPrivacyPassword('Mx179516')).toBe(true);
    expect(verifyPrivacyPassword('mx179516')).toBe(false);
    expect(verifyPrivacyPassword('')).toBe(false);
  });

  it('会话内可读写访问状态', () => {
    expect(readPrivacyAccess()).toBe(false);
    expect(readPrivacySessionPassword()).toBe(null);

    grantPrivacyAccess('Mx179516');
    expect(readPrivacyAccess()).toBe(true);
    expect(readPrivacySessionPassword()).toBe('Mx179516');

    clearPrivacyAccess();
    expect(readPrivacyAccess()).toBe(false);
    expect(readPrivacySessionPassword()).toBe(null);
  });
});
