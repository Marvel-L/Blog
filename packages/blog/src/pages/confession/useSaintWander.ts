import { useEffect, useRef, useState } from 'react';
import { SAINT } from './sceneSpace';
/** Keep every wander segment in the clear centre aisle; pause preserves progress. */
export function useSaintWander(active: boolean, still: boolean) {
  const [point, setPoint] = useState({ x: SAINT.x, z: SAINT.z, walking: false, facing: 1 });
  const current = useRef({ x: SAINT.x, z: SAINT.z });
  const target = useRef<{ x: number; z: number } | null>(null);
  const wait = useRef(2.5);
  useEffect(() => {
    if (!active || still) return;
    let frame = 0,
      last = 0;
    const tick = (now: number) => {
      const dt = last === 0 ? 0 : Math.min(0.05, (now - last) / 1000);
      last = now;
      if (wait.current > 0) {
        wait.current -= dt;
      } else {
        if (!target.current) {
          target.current = { x: (Math.random() - 0.5) * 0.65, z: -2.1 + Math.random() * 5.7 };
        }
        const dx = target.current.x - current.current.x,
          dz = target.current.z - current.current.z;
        const distance = Math.hypot(dx, dz);
        if (distance < 0.025) {
          wait.current = 2 + Math.random() * 5;
          target.current = null;
          setPoint((p) => ({ ...p, walking: false }));
        } else {
          const step = Math.min(distance, dt * 0.43);
          current.current = {
            x: current.current.x + (dx / distance) * step,
            z: current.current.z + (dz / distance) * step,
          };
          setPoint({ ...current.current, walking: true, facing: dx - dz < 0 ? -1 : 1 });
        }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [active, still]);
  return point;
}
