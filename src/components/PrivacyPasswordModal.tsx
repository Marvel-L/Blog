import React, { useEffect, useRef, useState } from 'react';
import { LockKeyhole, SmilePlus } from 'lucide-react';
import { SlideModal } from '@/components/SlideModal';
import { verifyPrivacyPassword } from '@/utils/privacyAccess';

interface PrivacyPasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (password: string) => void | Promise<void>;
  title?: string;
  description?: string;
}

export const PrivacyPasswordModal: React.FC<PrivacyPasswordModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  title = '输入隐私页密码',
  description = '只有密码验证通过后，才能查看隐私页面中的文章和内容。',
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setPassword('');
      setError(null);
      setIsSubmitting(false);
    }
  }, [isOpen]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (isSubmitting) {
      return;
    }

    if (!verifyPrivacyPassword(password)) {
      setError('密码错误，请重新输入。');
      return;
    }

    try {
      setIsSubmitting(true);
      await onSuccess(password);
      setError(null);
      setPassword('');
    } catch {
      setError('隐私内容解锁失败，请重试。');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SlideModal
      isOpen={isOpen}
      onClose={onClose}
      initialFocusRef={inputRef}
      ariaLabelledby="privacy-password-title"
      ariaDescribedby="privacy-password-description"
      className="sm:max-w-xl"
    >
      <div className="px-5 pb-5 pt-4 sm:px-6 sm:pb-6 sm:pt-5">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 rounded-icon border border-zinc-300 bg-zinc-100 p-2 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
              <SmilePlus size={18} aria-hidden="true" />
            </div>
            <div>
              <h2 id="privacy-password-title" className="text-lg font-semibold text-ink dark:text-white">
                {title}
              </h2>
              <p id="privacy-password-description" className="mt-1 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
                {description}
              </p>
            </div>
          </div>
          <div className="rounded-icon border border-zinc-200 bg-white/70 p-2 text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950/60 dark:text-zinc-400">
            <LockKeyhole size={16} aria-hidden="true" />
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-200">密码</span>
            <input
              ref={inputRef}
              type="password"
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                if (error) {
                  setError(null);
                }
              }}
              autoComplete="current-password"
              aria-label="隐私页密码"
              aria-invalid={error ? 'true' : 'false'}
              className="w-full rounded-control border border-zinc-300 bg-white px-3 py-2.5 text-sm text-ink outline-none transition-colors placeholder:text-zinc-400 focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white dark:placeholder:text-zinc-500 dark:focus:border-zinc-500"
              placeholder="请输入密码"
            />
          </label>

          <p
            className={`min-h-5 text-sm ${error ? 'text-red-600 dark:text-red-400' : 'text-zinc-500 dark:text-zinc-400'}`}
            aria-live="polite"
          >
            {error || '口令验证只在当前浏览器会话中生效。'}
          </p>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="inline-flex min-h-11 items-center justify-center rounded-control border border-zinc-300 px-4 text-sm font-medium text-zinc-700 transition-colors hover:border-zinc-500 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex min-h-11 items-center justify-center rounded-control border border-zinc-900 bg-zinc-900 px-4 text-sm font-semibold text-white transition-colors hover:bg-zinc-700 dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
            >
              {isSubmitting ? '解锁中...' : '验证并进入'}
            </button>
          </div>
        </form>
      </div>
    </SlideModal>
  );
};
