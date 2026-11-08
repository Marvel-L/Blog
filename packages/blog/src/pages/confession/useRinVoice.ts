import { useEffect, useRef, useState } from 'react';
import greeting from '@/assets/confession/voice/greeting-v4.wav';
import listening from '@/assets/confession/voice/listening.wav';
import welcome from '@/assets/confession/voice/welcome.wav';
import archive from '@/assets/confession/voice/archive.wav';
import saved from '@/assets/confession/voice/saved.wav';
import retry from '@/assets/confession/voice/retry.wav';
export const RIN_LINES = [
  { text: '你今天想忏悔什么？', voice: greeting },
  { text: '不用急着整理好语言。我在听。', voice: listening },
  { text: '这里没有评分，也没有判决。你可以只写下此刻想说的话。', voice: welcome },
  { text: '写完了，再决定把它放在哪座墓碑里。只有你自己能看见。', voice: archive },
  { text: '已经收好了。愿你离开这里时，心里轻一点。', voice: saved },
  { text: '没关系，我们可以再试一次。刚才写下的话，还在这里。', voice: retry },
];
/** Play fixed local lines only; journal content can never reach an audio transport. */
export function useRinVoice(line: number, muted: boolean) {
  const player = useRef<HTMLAudioElement | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [error, setError] = useState('');
  const [replay, setReplay] = useState(0);
  useEffect(() => {
    const audio = new Audio(RIN_LINES[line].voice);
    player.current = audio;
    let disposed = false;
    setError('');
    setSpeaking(false);
    audio.onplaying = () => {
      if (!disposed) setSpeaking(true);
    };
    audio.onpause = () => {
      if (!disposed) setSpeaking(false);
    };
    audio.onended = () => {
      if (!disposed) setSpeaking(false);
    };
    const play = () => {
      if (muted || document.hidden) return;
      setError('');
      void audio.play().catch(() => {
        if (!disposed) {
          setSpeaking(false);
          setError('配音未能播放，点击回听重试');
        }
      });
    };
    const visibility = () => {
      if (document.hidden) audio.pause();
      else if (!audio.ended) play();
    };
    audio.onerror = () => {
      if (!disposed) {
        setSpeaking(false);
        setError('配音加载失败，点击回听重试');
      }
    };
    play();
    document.addEventListener('visibilitychange', visibility);
    return () => {
      disposed = true;
      document.removeEventListener('visibilitychange', visibility);
      audio.pause();
      audio.onplaying = null;
      audio.onpause = null;
      audio.onended = null;
      audio.onerror = null;
      player.current = null;
    };
  }, [line, muted, replay]);
  return { speaking: !muted && speaking, error, replay: () => setReplay((v) => v + 1) };
}
