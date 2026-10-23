import head from './art/rin-head.webp';
import body from './art/rin-body.webp';

/** Layers extracted from the user-supplied reference; this is not a .moc3 model. */
export function RinArtwork() {
  return (
    <span className="rin-artwork" aria-hidden="true">
      <img className="rin-body" src={body} alt="" draggable={false} />
      <span className="rin-head">
        <img src={head} alt="" draggable={false} />
        <svg className="rin-eyelids" viewBox="0 0 390 1179" fill="none">
          <path d="M110 240 Q125 233 144 243 L145 267 Q127 280 115 261Z" fill="#f1d9c4" />
          <path d="M183 243 Q196 234 211 240 L211 266 Q196 279 183 263Z" fill="#f1d9c4" />
          <path
            d="M115 251 Q127 260 141 250 M185 250 Q197 258 209 250"
            stroke="#4b3e46"
            strokeWidth="4"
            strokeLinecap="round"
          />
        </svg>
      </span>
    </span>
  );
}
