import grass from '@/assets/confession/oblique/grass-surface.webp';
import stone from '@/assets/confession/oblique/stone-surface.webp';
import windowWall from '@/assets/confession/oblique/window-wall.webp';
import { polygon, project, type GroundPoint } from './sceneSpace';

const point = (x: number, z: number, height = 0): GroundPoint => ({ x, z, height });
function Block({
  x,
  z,
  width,
  length,
  height,
  className = '',
}: {
  x: number;
  z: number;
  width: number;
  length: number;
  height: number;
  className?: string;
}) {
  const a = point(x, z),
    b = point(x + width, z),
    c = point(x + width, z + length),
    d = point(x, z + length);
  return (
    <g className={`confiso-block ${className}`}>
      <polygon points={polygon([a, b, { ...b, height }, { ...a, height }])} className="confiso-block-side" />
      <polygon points={polygon([b, c, { ...c, height }, { ...b, height }])} className="confiso-block-side" />
      <polygon points={polygon([c, d, { ...d, height }, { ...c, height }])} className="confiso-block-front" />
      <polygon points={polygon([d, a, { ...a, height }, { ...d, height }])} className="confiso-block-front" />
      <polygon points={polygon([a, b, c, d].map((p) => ({ ...p, height })))} className="confiso-block-top" />
    </g>
  );
}
function Wall({ a, b }: { a: GroundPoint; b: GroundPoint }) {
  const A = project(a),
    B = project(b);
  const topA = project({ ...a, height: 3.35 }),
    topB = project({ ...b, height: 3.35 });
  return (
    <g className="confiso-wall">
      <polygon
        points={`${A.x},${A.y} ${B.x},${B.y} ${topB.x},${topB.y} ${topA.x},${topA.y}`}
        fill="url(#confiso-masonry)"
      />
      {Array.from({ length: 4 }, (_, i) => {
        const p = project({ x: a.x + ((b.x - a.x) * i) / 4, z: a.z + ((b.z - a.z) * i) / 4, height: 3.35 });
        const dx = (B.x - A.x) / 4,
          dy = (B.y - A.y) / 4;
        return (
          <image
            key={i}
            href={windowWall}
            width="160"
            height="200"
            transform={`matrix(${dx / 160} ${dy / 160} 0 ${(3.35 * 52) / 200} ${p.x} ${p.y})`}
          />
        );
      })}
      <path d={`M${topA.x},${topA.y}L${topB.x},${topB.y}`} className="confiso-coping" />
    </g>
  );
}
export function SceneGround({ church }: { church: boolean }) {
  const path = [point(1.1, 7.8), point(1.1, 5), point(3.1, 2.8), point(3.6, -0.4), point(3.1, -3.6)];
  const projected = path.map(project);
  const road = `M${projected[0].x},${projected[0].y} C${projected[0].x + 50},${projected[0].y - 80} ${projected[1].x - 45},${projected[1].y + 35} ${projected[1].x},${projected[1].y} S${projected[2].x - 25},${projected[2].y + 45} ${projected[2].x},${projected[2].y} S${projected[3].x + 45},${projected[3].y + 30} ${projected[3].x},${projected[3].y} L${projected[4].x},${projected[4].y}`;
  return (
    <svg className="confiso-ground" viewBox="0 0 1200 850" aria-hidden="true" data-ground="projected">
      <defs>
        <pattern
          id="confiso-grass"
          width="340"
          height="340"
          patternUnits="userSpaceOnUse"
          patternTransform="matrix(1 .5 -1 .5 600 130)"
        >
          <image href={grass} width="340" height="340" />
        </pattern>
        <pattern
          id="confiso-stone"
          width="220"
          height="220"
          patternUnits="userSpaceOnUse"
          patternTransform="matrix(1 .5 -1 .5 600 130)"
        >
          <image href={stone} width="220" height="220" />
        </pattern>
        <pattern id="confiso-masonry" width="175" height="175" patternUnits="userSpaceOnUse">
          <image href={stone} width="175" height="175" />
          <rect width="175" height="175" fill="#0c1922" opacity=".48" />
        </pattern>
        <linearGradient id="confiso-window" x2="0" y2="1">
          <stop stopColor="#97b9c5" />
          <stop offset=".5" stopColor="#3c6a8a" />
          <stop offset="1" stopColor="#78979c" />
        </linearGradient>
        <radialGradient id="confiso-pool">
          <stop stopColor="#f4f1d0" stopOpacity=".55" />
          <stop offset="1" stopColor="#f4f1d0" stopOpacity="0" />
        </radialGradient>
      </defs>
      {!church ? (
        <g>
          <polygon
            points={polygon([point(-8, -8), point(10, -8), point(10, 10), point(-8, 10)])}
            fill="url(#confiso-grass)"
          />
          <path d={road} stroke="#203237" strokeWidth="54" fill="none" strokeLinecap="round" />
          <path d={road} stroke="url(#confiso-stone)" strokeWidth="44" fill="none" strokeLinecap="round" />
          <path d={road} className="confiso-road-edge" />
          <ellipse cx={projected[4].x - 7} cy={projected[4].y + 16} rx="65" ry="28" fill="url(#confiso-pool)" />
        </g>
      ) : (
        <g>
          <polygon
            points={polygon([point(-4.7, -4.6), point(4.7, -4.6), point(4.7, 5.5), point(-4.7, 5.5)])}
            fill="url(#confiso-stone)"
            className="confiso-floor"
          />
          <Wall a={point(-4.7, -4.6)} b={point(4.7, -4.6)} />
          <Wall a={point(-4.7, -4.6)} b={point(-4.7, 5.5)} />
          <polygon
            points={polygon([point(-0.75, -2.8), point(0.75, -2.8), point(0.75, 5.5), point(-0.75, 5.5)])}
            fill="#597670"
            opacity=".52"
          />
          <Block x={-1.65} z={-3.7} width={3.3} length={1.2} height={0.18} className="confiso-dais" />
          <ellipse
            cx={project({ x: 0, z: -2 }).x}
            cy={project({ x: 0, z: -2 }).y}
            rx="100"
            ry="47"
            fill="url(#confiso-pool)"
          />
        </g>
      )}
    </svg>
  );
}
