const PRIVACY_ACCESS_STORAGE_KEY = 'd-blog-privacy-access';
const PRIVACY_PASSWORD_STORAGE_KEY = 'd-blog-privacy-password';
const PRIVACY_ACCESS_GRANTED = 'granted';
const PRIVACY_PASSWORD = 'Mx179516';
export const PRIVACY_ACCESS_CHANGE_EVENT = 'd-blog-privacy-access-change';

const readStorageValue = (key: string) => {
  try {
    const localValue = window.localStorage.getItem(key);
    if (localValue !== null) {
      return localValue;
    }
  } catch {
    // 浏览器本地存储不可用时，继续回退到 sessionStorage。
  }

  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
};

const writeStorageValue = (key: string, value: string) => {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // 本地存储不可用时，至少保留会话级访问状态。
  }

  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    // 会话存储不可用时，由 localStorage 兜底。
  }
};

const removeStorageValue = (key: string) => {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore
  }

  try {
    window.sessionStorage.removeItem(key);
  } catch {
    // ignore
  }
};

const emitPrivacyAccessChange = (hasAccess: boolean) => {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(
    new CustomEvent(PRIVACY_ACCESS_CHANGE_EVENT, {
      detail: { hasAccess },
    }),
  );
};

export const verifyPrivacyPassword = (password: string) => password === PRIVACY_PASSWORD;

export const readPrivacyAccess = () => readStorageValue(PRIVACY_ACCESS_STORAGE_KEY) === PRIVACY_ACCESS_GRANTED;

export const readPrivacySessionPassword = () => readStorageValue(PRIVACY_PASSWORD_STORAGE_KEY);

export const grantPrivacyAccess = (password: string) => {
  writeStorageValue(PRIVACY_ACCESS_STORAGE_KEY, PRIVACY_ACCESS_GRANTED);
  writeStorageValue(PRIVACY_PASSWORD_STORAGE_KEY, password);
  emitPrivacyAccessChange(true);
};

export const clearPrivacyAccess = () => {
  removeStorageValue(PRIVACY_ACCESS_STORAGE_KEY);
  removeStorageValue(PRIVACY_PASSWORD_STORAGE_KEY);
  emitPrivacyAccessChange(false);
};
