import { useEffect, useId, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { FileText, X } from 'lucide-react';
import { Surface } from '@/components/ui/Surface';
import { useModalOverlay } from '@/hooks/useModalOverlay';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { getAbilityData } from '@/services/abilities';
import {
  ABILITY_DIMENSIONS,
  ABILITY_GRADES,
  abilityPoint,
  abilityDocumentRoute,
  type AbilityData,
} from './ability-core.mjs';
import './abilities.css';

export function AbilityRadar({ data = getAbilityData() }: { data?: AbilityData }) {
  const id = useId().replace(/:/g, '');
  const [selected, setSelected] = useState<string | null>(null);
  const [motion, setMotion] = useState(true);
  const [idle, setIdle] = useState(false);
  const [mounted, setMounted] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const modal = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const reduced = useReducedMotion();
  const hasData = ABILITY_DIMENSIONS.some((item) => data.config[item.title]);
  const points = ABILITY_DIMENSIONS.map((item, index) =>
    abilityPoint(index, data.config[item.title] ? ABILITY_GRADES[data.config[item.title]!].rank : 0),
  );
  const shape = points.map((point) => point.join(',')).join(' ');
  const close = () => setSelected(null);
  useModalOverlay({ isOpen: Boolean(selected), onClose: close, containerRef: modal, initialFocusRef: closeButton });
  useEffect(() => {
    setMounted(true);
  }, []);
  useEffect(() => {
    const target = container.current;
    let visible = true;
    const update = () => setIdle(!visible || document.hidden);
    const observer =
      target && typeof IntersectionObserver !== 'undefined'
        ? new IntersectionObserver(
            (entries) => {
              visible = entries[0]?.isIntersecting !== false;
              update();
            },
            { threshold: 0.05 },
          )
        : null;
    if (target) observer?.observe(target);
    document.addEventListener('visibilitychange', update);
    update();
    return () => {
      observer?.disconnect();
      document.removeEventListener('visibilitychange', update);
    };
  }, []);
  const selectedDimension = ABILITY_DIMENSIONS.find((item) => item.title === selected);
  const documents = data.documents.filter((item) => item.dimension === selected);
  return (
    <Surface className="ability-surface mt-6 p-4 md:mt-8">
      <header className="ability-header">
        <h2 className="text-2xl font-bold">能力雷达</h2>
        {hasData && (
          <button
            type="button"
            className="editorial-button"
            aria-label="节点呼吸闪烁"
            aria-pressed={motion && !reduced}
            disabled={reduced}
            onClick={() => setMotion((current) => !current)}
          >
            {reduced ? '系统已关闭动效' : motion ? '关闭闪烁' : '开启闪烁'}
          </button>
        )}
      </header>
      <div ref={container} className="ability-chart" data-motion={motion && !reduced ? 'on' : 'off'} data-idle={idle}>
        <svg viewBox="0 0 700 530" role="img" aria-label={hasData ? '九维能力雷达图' : '九维能力雷达图，暂无等级数据'}>
          <defs>
            <linearGradient id={`${id}-glass`} x1="0%" y1="0%" x2="85%" y2="100%">
              <stop offset="0%" stopColor="#f8feff" stopOpacity=".36" />
              <stop offset="32%" stopColor="#d3f0f6" stopOpacity=".16" />
              <stop offset="72%" stopColor="#9fc9dc" stopOpacity=".23" />
              <stop offset="100%" stopColor="#c2e8ed" stopOpacity=".1" />
            </linearGradient>
            <linearGradient id={`${id}-rim`} x1="10%" y1="0%" x2="85%" y2="100%">
              <stop offset="0%" stopColor="white" stopOpacity=".95" />
              <stop offset="42%" stopColor="#d9f3fa" stopOpacity=".56" />
              <stop offset="70%" stopColor="#689eb6" stopOpacity=".15" />
              <stop offset="100%" stopColor="#edfaff" stopOpacity=".7" />
            </linearGradient>
            <linearGradient id={`${id}-reflection`} x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="white" stopOpacity=".45" />
              <stop offset="48%" stopColor="white" stopOpacity=".09" />
              <stop offset="100%" stopColor="white" stopOpacity="0" />
            </linearGradient>
            <clipPath id={`${id}-clip`}>
              <polygon points={shape} />
            </clipPath>
          </defs>
          {[1, 2, 3, 4, 5, 6].map((rank) => (
            <polygon
              key={rank}
              points={ABILITY_DIMENSIONS.map((_, index) => abilityPoint(index, rank).join(',')).join(' ')}
              fill="none"
              stroke="currentColor"
              strokeOpacity={rank === 6 ? 0.2 : 0.1}
            />
          ))}
          {ABILITY_DIMENSIONS.map((item, index) => {
            const [x, y] = abilityPoint(index, 6);
            return <line key={item.title} x1="350" y1="262" x2={x} y2={y} stroke="currentColor" strokeOpacity=".14" />;
          })}
          {hasData && (
            <>
              <polygon data-shape="ability-area" className="ability-glass" points={shape} fill={`url(#${id}-glass)`} />
              <path
                d="M 120 60 L 590 60 L 570 214 Q 360 335 130 175 Z"
                clipPath={`url(#${id}-clip)`}
                fill={`url(#${id}-reflection)`}
                pointerEvents="none"
              />
              <polygon points={shape} fill="none" stroke={`url(#${id}-rim)`} strokeWidth="2" strokeLinejoin="round" />
            </>
          )}
          {hasData ? (
            ABILITY_DIMENSIONS.map((item, index) => {
              const grade = data.config[item.title];
              if (!grade) return null;
              const [x, y] = points[index];
              const color = ABILITY_GRADES[grade].color;
              return (
                <g key={item.title} style={{ '--node-delay': `${-index * 0.32}s` } as CSSProperties}>
                  <circle
                    className="ability-node-halo"
                    cx={x}
                    cy={y}
                    r={selected === item.title ? 13 : 9}
                    fill={color}
                    fillOpacity=".28"
                  />
                  <circle
                    data-node={item.title}
                    className="ability-node"
                    cx={x}
                    cy={y}
                    r="5.5"
                    fill={color}
                    stroke="var(--ability-node-border)"
                    strokeWidth="1.8"
                  />
                  <circle
                    cx={x}
                    cy={y}
                    r="10"
                    fill="transparent"
                    className="ability-node-hit"
                    onClick={() => setSelected(item.title)}
                    aria-hidden="true"
                  />
                </g>
              );
            })
          ) : (
            <circle data-empty-center="true" cx="350" cy="262" r="5.5" fill="black" />
          )}
          {hasData && ABILITY_DIMENSIONS.some((item) => !data.config[item.title]) && (
            <circle data-missing-center="true" cx="350" cy="262" r="4" fill="black" />
          )}
        </svg>
        {ABILITY_DIMENSIONS.map((item, index) => {
          const [x, y] = abilityPoint(index, 8.25);
          const grade = data.config[item.title];
          return (
            <button
              key={item.title}
              type="button"
              className="ability-axis"
              data-dimension={item.title}
              style={{ left: `${(x / 700) * 100}%`, top: `clamp(24px,${(y / 530) * 100}%,calc(100% - 24px))` }}
              aria-haspopup="dialog"
              aria-label={`${item.title}${grade ? `，当前 ${grade}` : ''}，查看文档`}
              onClick={() => setSelected(item.title)}
            >
              {item.title}
              {grade && <span style={{ color: ABILITY_GRADES[grade].color }}>({grade})</span>}
            </button>
          );
        })}
      </div>
      {mounted &&
        selectedDimension &&
        createPortal(
          <div
            className="ability-backdrop"
            onClick={(event) => {
              if (event.target === event.currentTarget) close();
            }}
          >
            <div
              ref={modal}
              className="ability-dialog editorial-overlay"
              role="dialog"
              aria-modal="true"
              aria-labelledby={`${id}-dialog-title`}
              tabIndex={-1}
            >
              <header>
                <h2 id={`${id}-dialog-title`}>
                  {selectedDimension.title}
                  {data.config[selectedDimension.title] ? `(${data.config[selectedDimension.title]})` : ''}
                </h2>
                <button
                  ref={closeButton}
                  type="button"
                  className="editorial-button"
                  aria-label="关闭文档列表"
                  onClick={close}
                >
                  <X size={18} />
                </button>
              </header>
              <p className="ability-description">{selectedDimension.description}</p>
              {documents.length ? (
                <ul>
                  {documents.map((document) => (
                    <li key={document.filename}>
                      <Link
                        to={abilityDocumentRoute(document.dimension, document.filename)}
                        className="ability-file"
                        onClick={close}
                      >
                        <FileText size={20} />
                        <span>
                          {document.filename}
                          <small>{document.title}</small>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p role="status" className="ability-empty">
                  这个维度暂无文档。
                </p>
              )}
            </div>
          </div>,
          document.body,
        )}
    </Surface>
  );
}
