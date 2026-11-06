import { useCallback, useEffect, useRef, useState } from 'react';

/** 用户主动开启后，合成低沉水声；离开页面时释放所有音频节点。 */
export const useOceanAudio = (paused: boolean) => {
  const audioRef = useRef<{ context: AudioContext; source: AudioBufferSourceNode; gain: GainNode } | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [error, setError] = useState('');
  const generationRef = useRef(0);

  const stop = useCallback(() => {
    generationRef.current += 1;
    const audio = audioRef.current;
    audioRef.current = null;
    if (audio) {
      try {
        audio.source.stop();
      } catch {
        // 若音频源尚未启动，继续关闭上下文并释放已连接的节点。
      }
      audio.source.disconnect();
      audio.gain.disconnect();
      void audio.context.close().catch(() => {});
    }
  }, []);

  useEffect(() => stop, [stop]);

  useEffect(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.gain.gain.setTargetAtTime(paused ? 0 : 0.32, audio.context.currentTime, 0.3);
    }
  }, [paused]);

  const toggle = async () => {
    if (enabled || audioRef.current) {
      stop();
      setEnabled(false);
      return;
    }
    setError('');
    const generation = ++generationRef.current;
    let context: AudioContext | null = null;
    try {
      const AudioConstructor = window.AudioContext;
      if (!AudioConstructor) throw new Error('Audio unavailable');
      context = new AudioConstructor();
      const source = context.createBufferSource();
      const buffer = context.createBuffer(1, context.sampleRate * 6, context.sampleRate);
      const samples = buffer.getChannelData(0);
      let last = 0;
      for (let i = 0; i < samples.length; i++) {
        last = (last + (Math.random() * 2 - 1) * 0.02) / 1.02;
        samples[i] = last * 3.5;
      }
      source.buffer = buffer;
      source.loop = true;
      const filter = context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 380;
      const gain = context.createGain();
      gain.gain.value = paused ? 0 : 0.32;
      source.connect(filter);
      filter.connect(gain);
      gain.connect(context.destination);
      audioRef.current = { context, source, gain };
      source.start();
      await context.resume();
      if (generationRef.current !== generation) return;
      setEnabled(true);
    } catch {
      if (generationRef.current !== generation) return;
      stop();
      if (context && context.state !== 'closed') void context.close().catch(() => {});
      setEnabled(false);
      setError('暂时无法开启环境音，你仍可以安静地看海。');
    }
  };
  return { enabled, error, toggle };
};
