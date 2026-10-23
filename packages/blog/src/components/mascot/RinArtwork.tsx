import { useEffect } from 'react';
import rinIdle from '@/assets/mascot/rin-anim-idle.webp';
import rinNod from '@/assets/mascot/rin-anim-nod.webp';
import rinStretch from '@/assets/mascot/rin-anim-stretch.webp';
import rinTea from '@/assets/mascot/rin-anim-tea.webp';
import rinWave from '@/assets/mascot/rin-anim-wave.webp';
import rinBase from '@/assets/mascot/rin-live-base.webp';
import type { RinReaction } from './rinConfig';

const animationArtwork: Record<RinReaction, string> = {
  idle: rinIdle,
  nod: rinNod,
  wave: rinWave,
  stretch: rinStretch,
  tea: rinTea,
};

/**
 * Continuous frame animations extracted from two fixed-camera motion masters.
 * Each interactive clip starts and ends at the same registered standing pose;
 * remounting the image by sequence restarts the requested action from frame 1.
 */
export function RinArtwork({
  reaction = 'idle',
  sequence = 0,
  paused = false,
}: {
  reaction?: RinReaction;
  sequence?: number;
  paused?: boolean;
}) {
  useEffect(() => {
    for (const source of Object.values(animationArtwork)) {
      const image = new Image();
      image.decoding = 'async';
      image.src = source;
    }
  }, []);

  const source = paused ? rinBase : animationArtwork[reaction];
  return (
    <span
      className="rin-artwork"
      data-generated-live2d="frame-animation"
      data-artwork-reaction={reaction}
      aria-hidden="true"
    >
      <img
        key={`${reaction}-${sequence}-${paused ? 'paused' : 'playing'}`}
        className={`rin-frame-animation${reaction === 'tea' ? ' rin-cup' : ''}`}
        src={source}
        alt=""
        draggable={false}
      />
      <span className="rin-reference-hotspot rin-reference-hotspot-head" data-rin-touch="nod" />
      <span className="rin-reference-hotspot rin-reference-hotspot-body" data-rin-touch="stretch" />
      <span className="rin-reference-hotspot rin-reference-hotspot-hand" data-rin-touch="wave" />
    </span>
  );
}
