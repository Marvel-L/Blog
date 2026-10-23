import type { RinReaction } from './rinConfig';

/**
 * Opaque vector drawing with shoulder, elbow, wrist and neck joints.
 * No bitmap extraction, background removal or Cubism model is involved.
 * Joint coordinates in rin-mascot.css use this 300 × 500 viewBox.
 */
export function RinArtwork({ reaction = 'idle' }: { reaction?: RinReaction }) {
  const openHand = reaction === 'wave' || reaction === 'stretch';

  return (
    <svg
      className="rin-artwork"
      viewBox="0 0 300 500"
      fill="none"
      stroke="#343d52"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <g className="rin-figure">
        {/* Separate legs keep the skirt and boots solid during the weight shift. */}
        <g className="rin-leg rin-leg-back">
          <path d="M153 323 181 324 175 404 157 405Z" fill="#414b62" />
          <path d="m164 333 10 1-6 63-6 1Z" fill="#525e76" stroke="none" />
          <path d="m156 393 22 1-1 31-23-1Z" fill="#e6ddd0" />
          <path d="m159 398 1 22m5-21 1 21m5-20 1 21" stroke="#c0b6a9" strokeWidth="1.5" />
          <path d="M154 415q10 5 24 0l4 18 13 12q4 5-1 11h-44q-3-11 1-20Z" fill="#8e6859" />
          <path d="m179 436 13 10q4 4 0 7h-40v-10q11 3 27-7" fill="#b48970" stroke="none" />
          <path d="M150 451h44v7h-44Z" fill="#3d4554" />
          <path d="m164 425 12-1m-11 7 13-2m-11 8 13-3" stroke="#efdfc4" strokeWidth="2.5" />
        </g>
        <g className="rin-leg rin-leg-front">
          <path d="m117 323 29 2-11 81-20-2Z" fill="#414b62" />
          <path d="m122 335 10 1-6 64-7-1Z" fill="#5a647e" stroke="none" />
          <path d="m113 394 24 1-3 31-24-2Z" fill="#f3eade" />
          <path d="m116 400-2 20m8-19-2 21m8-21-2 21" stroke="#c4b7a7" strokeWidth="1.5" />
          <path d="M109 416q12 5 27 1l-2 23q4 8 0 16H89q-4-6 1-12l16-10Z" fill="#aa8068" />
          <path d="M107 436q10 9 27 5v11H90q-2-4 3-7Z" fill="#c39b7a" stroke="none" />
          <path d="M89 451h45v7H89Z" fill="#3d4554" />
          <path d="m110 425 15 2m-18 5 16 3m-19 4 15 4" stroke="#f7e6c7" strokeWidth="2.5" />
          <path d="m94 446 12-5" stroke="#e3bc93" strokeWidth="2" />
        </g>

        <g className="rin-upper-body">
          {/* The far arm is behind the torso; the elbow still has its own pivot. */}
          <g className="rin-arm rin-arm-far" data-rin-touch="wave">
            <path d="M177 205q15-4 21 10l13 40-21 8-15-33Z" fill="#f5ebd7" />
            <path d="m190 218 12 36-9 4-9-32" fill="#e2d1b6" stroke="none" />
            <path d="m197 246 9 3m-12 3 9 3" stroke="#c1b39e" strokeWidth="1.4" />
            <g className="rin-forearm rin-forearm-far">
              <path d="M190 252q9-4 18 2l7 41-20 4Z" fill="#f5ebd7" />
              <path d="m203 262 7 30-7 2-5-30" fill="#e2d1b6" stroke="none" />
              <path d="m194 289 21-3 2 13-22 3Z" fill="#e1d4b9" />
              <path d="m199 291 1 7m5-8 1 7m5-8 1 7" stroke="#bcaf97" strokeWidth="1.3" />
              <g className="rin-hand rin-hand-far">
                <path
                  d={
                    openHand
                      ? 'm197 301 17-2 6 14q1 5-3 5l-4-7 5 16q0 4-4 2l-6-14 3 17q-2 3-5 0l-4-17 1 15q-2 3-4-1l-3-17q-6 2-7-2-1-3 8-9Z'
                      : 'm197 301 17-2 2 13q0 8-6 11-5 1-7-5l-4-7q-5 0-5-4Z'
                  }
                  fill="#f8d8c6"
                />
                {!openHand && <path d="m207 307 2 8m3-9 1 7" stroke="#c59084" strokeWidth="1.3" />}
              </g>
            </g>
          </g>

          <g data-rin-touch="stretch">
            {/* Cream knit, an outdoor gilet and a softly pleated skirt. */}
            <path d="M112 281q35-10 69 0l15 60q-42 17-91-1Z" fill="#626779" />
            <path d="m118 294-7 43 13 4 9-47m10 0-5 49 16 1 2-51m12 0 11 48 12-3-17-47" fill="#858795" />
            <path d="m132 301-6 38m28-35v37m18-39 9 34M109 338q39 13 82 0" stroke="#424b60" strokeWidth="1.7" />
            <path d="M114 202q29-13 64 0l10 49-4 40q-35 14-75-1l-2-47Z" fill="#faf0db" />
            <path d="m112 279 72 1v13q-36 10-75-1Z" fill="#e6d9bc" />
            <path
              d="m118 283-1 9m8-8v10m8-9v10m8-9v10m8-9v10m8-10v10m8-12v10m8-12v10"
              stroke="#bbad93"
              strokeWidth="1.3"
            />
            <path d="m117 201 19-4 10 29-1 56q-18 8-41-1l4-50Z" fill="#608b87" />
            <path d="m163 197 15 5 12 38-2 41q-22 8-41 1l1-56Z" fill="#6f9a90" />
            <path d="m117 211-6 56q8 6 19 5l-3-49Z" fill="#759e96" stroke="none" />
            <path d="m178 216 7 56-10 3-4-52Z" fill="#527d7b" stroke="none" />
            <path d="m138 211 9 14 12-15m-12 15v56" stroke="#d9ddc6" strokeWidth="2.8" />
            <path d="m111 251 24 2-2 21q-12 3-22-2Zm47 2 23-2 1 21q-12 4-23 2Z" fill="#567e7d" />
            <path d="m113 257 19 1m29 0 17-2" stroke="#adc0ac" strokeWidth="1.6" />
            <path d="M165 228h14v11h-14Z" fill="#eee7cc" stroke="#44696c" strokeWidth="1.4" />
            <path d="m167 236 4-5 2 3 2-2 2 4" stroke="#60857d" strokeWidth="1.4" />
            <path d="m145 244 4 0v8h-4Z" fill="#e6c294" strokeWidth="1.2" />
          </g>

          <g className="rin-scarf-tail">
            <path d="m163 194 19 2q-2 29 8 48l-23 8q-9-21-4-58Z" fill="#cf8f91" />
            <path d="m162 212 22-4 2 11-24 5Z" fill="#e9c1b0" stroke="none" />
            <path d="m164 232 23-6 3 12-23 7Z" fill="#7c829f" stroke="none" />
            <path d="m168 249 1 7m5-9 2 7m4-9 2 7m4-9 2 7" stroke="#bd858c" strokeWidth="2.5" />
          </g>

          <g className="rin-head-look">
            <g className="rin-head" data-rin-touch="nod">
              {/* Solid hair silhouette extends behind the face and scarf. */}
              <path d="M93 82q-20 23-13 69l-5 29 13-5-2 16 20-13 89 7 16 7-3-25q12-56-18-79Z" fill="#303e57" />
              <g className="rin-hair-bun">
                <path
                  d="M133 69q-23-6-24-24-2-15 13-21-5-11 12-15 19-5 30 7 16 0 22 12 8 16-6 31-11 15-47 10Z"
                  fill="#364660"
                />
                <path
                  d="M122 25q30-10 48 10m-51 5q29-12 57 6m-44-29q17-2 27 7m-36 28q18 9 43 4"
                  stroke="#647188"
                  strokeWidth="2.4"
                />
                <path d="M132 59q18-6 36-1l4 10-43 3Z" fill="#9fa4b9" />
                <path d="m136 62 30-1" stroke="#d5cbd3" strokeWidth="2.2" />
              </g>
              <path d="M86 119q-10-9-12 4-2 16 14 17m112-20q13-9 13 4 1 14-13 17" fill="#f0bfae" />
              <path d="M91 98q6-24 54-26 47-2 53 29l-1 46q-4 30-46 42-39-9-53-34Z" fill="#ffe7d5" />
              <path d="M96 140q8 26 54 35 34-7 46-24-5 26-45 38-39-9-53-34Z" fill="#f5cfbb" stroke="none" />
              <path d="m117 143-6 5m13-4-5 6m56-8 5 5m-12-3 5 6" stroke="#e7a5a2" strokeWidth="2.2" />
              <path d="m149 143-2 4 4 1" stroke="#cc9b91" strokeWidth="1.4" />
              <path className="rin-mouth-rest" d="M143 163q7 3 14-1" stroke="#926c71" strokeWidth="1.8" />
              <path
                className="rin-mouth-smile"
                d="M141 161q9 11 18-1"
                fill="#cf8b90"
                stroke="#926c71"
                strokeWidth="1.6"
              />
              <path d="m104 116 21-3m43 0 20 2" stroke="#566074" strokeWidth="2" />
              <g className="rin-eyes-open">
                <path d="M102 126q12-9 28 0l-2 15q-13 9-23-1Z" fill="#fffdf5" stroke="none" />
                <path d="M166 125q13-9 26 1l-3 14q-12 8-21 0Z" fill="#fffdf5" stroke="none" />
                <g className="rin-pupils">
                  <path d="M112 123q7-3 12 1l-1 14q-5 11-12 0Z" fill="#867899" stroke="#4a4965" strokeWidth="1.4" />
                  <path d="M174 123q7-3 12 1l-1 14q-5 10-12 0Z" fill="#867899" stroke="#4a4965" strokeWidth="1.4" />
                  <path d="M113 136q3 9 9 0m52 0q4 9 10 0" stroke="#b9a5c0" strokeWidth="2.2" />
                  <path d="m117 126 0 9m61-9 0 9" stroke="#403e5b" strokeWidth="3.4" />
                  <ellipse cx="115" cy="127" rx="2.5" ry="3.1" fill="#fffdf6" stroke="none" />
                  <ellipse cx="177" cy="127" rx="2.5" ry="3.1" fill="#fffdf6" stroke="none" />
                </g>
                <path d="M101 124q14-6 28 1m36-1q14-6 27 1m-90-1-3-3m91 3 3-3" stroke="#354055" strokeWidth="3.6" />
                <path d="m106 143 7 2m63 0 8-2" stroke="#b29a9a" strokeWidth="1.4" />
              </g>
              <g className="rin-eyes-closed" stroke="#435068" strokeWidth="2.7">
                <path d="M104 131q12 9 24 0m39 0q12 8 23-1" />
              </g>
              {/* Long asymmetric fringe, face-framing side locks, navy highlights. */}
              <path
                d="M89 124q-15-47 17-60 35-18 74 2 28 17 23 54l-7 34-12-28-2-31q-2 16-8 23-16-11-26-35 1 21 11 34-17-9-27-29-1 22 5 29-16-6-23-23-3 19-16 35l-4 32-8-8Z"
                fill="#34445e"
              />
              <path
                d="M96 103q1-23 17-29 22-11 39-1-34-2-44 32Zm65-29q22 8 30 29l-5-22Z"
                fill="#596c85"
                stroke="none"
              />
              <path
                d="M91 113q-1-29 17-41m14 7q-2 12 7 27m17-29q3 17 14 29m10-28q13 13 15 28m10 11-1 17"
                stroke="#738199"
                strokeWidth="1.6"
              />
              <path d="m88 130 3 30m108-29 0 29" stroke="#52637c" strokeWidth="2" />
            </g>
          </g>

          {/* The neck is fully covered by the broad striped scarf. */}
          <g data-rin-touch="nod">
            <path d="M102 173q45 19 88-2l7 24q-11 21-51 21-29-1-48-18Z" fill="#d69d9f" />
            <path d="M101 177q47 20 90-1l3 9q-40 23-94 3Z" fill="#efd2b8" stroke="none" />
            <path d="M99 193q49 22 97-5l1 8q-47 25-97 7Z" fill="#7c819f" stroke="none" />
            <path d="M105 176q-4 15 8 28m63-25q-8 14-4 28" stroke="#b9808e" strokeWidth="1.4" />
            <path d="M107 185q29 12 55 6" stroke="#f5ddc5" strokeWidth="1.5" />
          </g>
          <NearArm reaction={reaction} />
        </g>
      </g>
    </svg>
  );
}

/** Foreground arm: the hand and cup must be able to pass in front of the face. */
function NearArm({ reaction }: { reaction: RinReaction }) {
  const openHand = reaction === 'wave' || reaction === 'stretch';
  return (
    <g className="rin-arm rin-arm-near" data-rin-touch="wave">
      <path d="M113 209q-12-10-20 4l-12 44q10 10 25 4l15-34Z" fill="#faf0db" />
      <path d="m95 220-9 36 9 3 8-34" fill="#e5d5b8" stroke="none" />
      <path d="m87 249 11-3m-12 9 11-3" stroke="#c6b69a" strokeWidth="1.4" />
      <g className="rin-forearm rin-forearm-near">
        <path d="M82 251q11-2 22 5l-4 38-22-2Z" fill="#faf0db" />
        <path d="m83 261-1 29 6 1 6-29" fill="#e5d5b8" stroke="none" />
        <path d="m78 286 24 3-2 14-24-3Z" fill="#e8dbc0" />
        <path d="m81 291-1 6m7-5-1 7m7-6-1 6m6-5-1 6" stroke="#c0af91" strokeWidth="1.3" />
        <g className="rin-hand rin-hand-near">
          {reaction === 'tea' ? (
            <g className="rin-cup">
              {/* Counter-rotate with the two arm joints to keep the cup upright. */}
              <g className="rin-cup-upright">
                <path d="M97 302q18-4 15 9-2 9-14 5" stroke="#394957" strokeWidth="7" />
                <path d="M97 302q18-4 15 9-2 9-14 5" stroke="#c5d9d4" strokeWidth="3.5" />
                <path d="m71 293 29-1-1 23q-11 10-26 0Z" fill="#d1e4db" />
                <ellipse cx="85.5" cy="293" rx="14.5" ry="4.5" fill="#f4f2df" />
                <ellipse cx="85.5" cy="293.5" rx="10.5" ry="2" fill="#96775f" stroke="none" />
                <path d="m76 302 17-1m-15 6 12-1" stroke="#82a99e" strokeWidth="1.6" />
                <g className="rin-cup-steam" stroke="#c8bba5" strokeWidth="1.8">
                  <path d="M80 285q-4-4 0-8t0-8M89 282q-4-4 0-8t0-7" />
                </g>
              </g>
              <path d="m77 301 12 2q6-7 9-3 2 3-2 6l-1 10q-6 7-12 0Z" fill="#f8d8c6" />
            </g>
          ) : (
            <path
              d={
                openHand
                  ? 'm78 301 19 2 1 12q7 6 3 9-3 2-8-4l-1 14q-2 4-4 0l-1-17-3 18q-3 3-4-1l1-18-5 16q-4 2-4-2l4-17-6 12q-4 1-3-3Z'
                  : 'm78 301 18 2 2 12q0 5-4 5l-3-7-1 10q-5 5-10-1l-5-12Z'
              }
              fill="#ffe3d0"
            />
          )}
        </g>
      </g>
    </g>
  );
}
