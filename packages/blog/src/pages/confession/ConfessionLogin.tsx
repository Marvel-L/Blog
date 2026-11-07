import { AccountCredentials } from '@/cloud/AccountCredentials';
export default function ConfessionLogin({ onDone }: { onDone: () => void }) {
  return (
    <div className="confession-login">
      <p>场景可以自由观赏。墓碑和记事仅你登录后可见。</p>
      <AccountCredentials user={null} onUser={onDone} />
    </div>
  );
}
