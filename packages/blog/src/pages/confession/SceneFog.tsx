import { useEffect, useState, type CSSProperties } from 'react';

/** Atmospheric values are visual-only; randomness starts after hydration for stable SSR. */
export function SceneFog({ still, band }: { still: boolean; band: number }) {
  const [weather, setWeather] = useState({ density: 0.54, duration: 42, offset: 8 });
  useEffect(() => {
    setWeather({ density: 0.38 + Math.random() * 0.35, duration: 32 + Math.random() * 23, offset: Math.random() * 28 });
  }, []);
  useEffect(() => {
    if (still) return;
    const timer = window.setInterval(
      () => setWeather((previous) => ({ ...previous, density: 0.38 + Math.random() * 0.35 })),
      18000,
    );
    return () => window.clearInterval(timer);
  }, [still]);
  return (
    <div
      className="conf25-fog"
      data-fog-band={band}
      style={
        {
          '--fog-density': weather.density,
          '--fog-speed': `${weather.duration + band * 9}s`,
          '--fog-phase': `${-weather.offset}s`,
        } as CSSProperties
      }
      aria-hidden="true"
    >
      {[0, 1, 2].map((i) => (
        <i key={i} style={{ '--wisp-phase': `${-i * 13}s` } as CSSProperties} />
      ))}
    </div>
  );
}
