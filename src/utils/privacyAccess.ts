const PRIVACY_ACCESS_STORAGE_KEY = 'd-blog-privacy-access';
const PRIVACY_PASSWORD_STORAGE_KEY = 'd-blog-privacy-password';
const PRIVACY_ACCESS_GRANTED = 'granted';
const PRIVACY_PASSWORD = 'Mx179516';

export const verifyPrivacyPassword = (password: string) => password === PRIVACY_PASSWORD;

export const readPrivacyAccess = () => {
  try {
    return window.sessionStorage.getItem(PRIVACY_ACCESS_STORAGE_KEY) === PRIVACY_ACCESS_GRANTED;
  } catch {
    return false;
  }
};

export const readPrivacySessionPassword = () => {
  try {
    return window.sessionStorage.getItem(PRIVACY_PASSWORD_STORAGE_KEY);
  } catch {
    return null;
  }
};

export const grantPrivacyAccess = (password: string) => {
  try {
    window.sessionStorage.setItem(PRIVACY_ACCESS_STORAGE_KEY, PRIVACY_ACCESS_GRANTED);
    window.sessionStorage.setItem(PRIVACY_PASSWORD_STORAGE_KEY, password);
  } catch {
    // 会话存储不可用时，当前页面内的访问状态仍由调用方内存态维持。
  }
};

export const clearPrivacyAccess = () => {
  try {
    window.sessionStorage.removeItem(PRIVACY_ACCESS_STORAGE_KEY);
    window.sessionStorage.removeItem(PRIVACY_PASSWORD_STORAGE_KEY);
  } catch {
    // 会话存储不可用时，无需抛错中断 UI。
  }
};
