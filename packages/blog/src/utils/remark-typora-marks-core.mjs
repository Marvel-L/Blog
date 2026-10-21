/**
 * Typora 风格行内标记的 micromark / mdast 扩展（构建脚本与客户端共用）：
 * `++下划线++` → <ins>，`==高亮==` → <mark>。
 *
 * 机制对齐 GFM 删除线（~~text~~）：在 tokenizer 层识别成对分隔符，因此可与
 * **粗体** / *斜体* 嵌套；未成对的 `C++`、`a == b` 保持原样。
 */
import { splice } from 'micromark-util-chunked';
import { classifyCharacter } from 'micromark-util-classify-character';
import { resolveAll } from 'micromark-util-resolve-all';

const PLUS_SIGN = 43;
const EQUALS_TO = 61;
const ATTENTION_SIDE_AFTER = 2;
const DATA = 'data';
const CHARACTER_ESCAPE = 'characterEscape';

const createMarkerConstruct = ({ name, markerCode, sequenceTemporary, sequence, wrap, wrapText }) => {
  const tokenizer = {
    name,
    tokenize: tokenizeMarker,
    resolveAll: resolveAllMarker,
  };

  function resolveAllMarker(events, context) {
    let index = -1;

    while (++index < events.length) {
      if (events[index][0] === 'enter' && events[index][1].type === sequenceTemporary && events[index][1]._close) {
        let open = index;

        while (open--) {
          if (
            events[open][0] === 'exit' &&
            events[open][1].type === sequenceTemporary &&
            events[open][1]._open &&
            events[index][1].end.offset - events[index][1].start.offset ===
              events[open][1].end.offset - events[open][1].start.offset &&
            events[open][1].end.offset < events[index][1].start.offset
          ) {
            events[index][1].type = sequence;
            events[open][1].type = sequence;

            const wrapper = {
              type: wrap,
              start: Object.assign({}, events[open][1].start),
              end: Object.assign({}, events[index][1].end),
            };
            const text = {
              type: wrapText,
              start: Object.assign({}, events[open][1].end),
              end: Object.assign({}, events[index][1].start),
            };
            const nextEvents = [
              ['enter', wrapper, context],
              ['enter', events[open][1], context],
              ['exit', events[open][1], context],
              ['enter', text, context],
            ];
            const insideSpan = context.parser.constructs.insideSpan.null;

            if (insideSpan) {
              splice(nextEvents, nextEvents.length, 0, resolveAll(insideSpan, events.slice(open + 1, index), context));
            }

            splice(nextEvents, nextEvents.length, 0, [
              ['exit', text, context],
              ['enter', events[index][1], context],
              ['exit', events[index][1], context],
              ['exit', wrapper, context],
            ]);
            splice(events, open - 1, index - open + 3, nextEvents);
            index = open + nextEvents.length - 2;
            break;
          }
        }
      }
    }

    index = -1;
    while (++index < events.length) {
      if (events[index][1].type === sequenceTemporary) {
        events[index][1].type = DATA;
      }
    }

    return events;
  }

  function tokenizeMarker(effects, ok, nok) {
    const previous = this.previous;
    const events = this.events;
    let size = 0;

    return start;

    function start(code) {
      if (previous === markerCode && events.length > 0 && events[events.length - 1][1].type !== CHARACTER_ESCAPE) {
        return nok(code);
      }

      effects.enter(sequenceTemporary);
      return more(code);
    }

    function more(code) {
      const before = classifyCharacter(previous);

      if (code === markerCode) {
        if (size > 1) return nok(code);
        effects.consume(code);
        size += 1;
        return more;
      }

      if (size < 2) return nok(code);

      const token = effects.exit(sequenceTemporary);
      const after = classifyCharacter(code);
      token._open = !after || (after === ATTENTION_SIDE_AFTER && Boolean(before));
      token._close = !before || (before === ATTENTION_SIDE_AFTER && Boolean(after));
      return ok(code);
    }
  }

  return tokenizer;
};

const underline = createMarkerConstruct({
  name: 'underline',
  markerCode: PLUS_SIGN,
  sequenceTemporary: 'underlineSequenceTemporary',
  sequence: 'underlineSequence',
  wrap: 'underline',
  wrapText: 'underlineText',
});

const highlight = createMarkerConstruct({
  name: 'highlight',
  markerCode: EQUALS_TO,
  sequenceTemporary: 'highlightSequenceTemporary',
  sequence: 'highlightSequence',
  wrap: 'highlight',
  wrapText: 'highlightText',
});

const typoraMarks = () => ({
  text: {
    [PLUS_SIGN]: underline,
    [EQUALS_TO]: highlight,
  },
  insideSpan: { null: [underline, highlight] },
  attentionMarkers: { null: [PLUS_SIGN, EQUALS_TO] },
});

const typoraMarksFromMarkdown = () => ({
  enter: {
    underline: function enterUnderline(token) {
      this.enter(
        {
          type: 'underline',
          children: [],
          data: { hName: 'ins' },
        },
        token,
      );
    },
    highlight: function enterHighlight(token) {
      this.enter(
        {
          type: 'highlight',
          children: [],
          data: { hName: 'mark' },
        },
        token,
      );
    },
  },
  exit: {
    underline: function exitUnderline(token) {
      this.exit(token);
    },
    highlight: function exitHighlight(token) {
      this.exit(token);
    },
  },
});

/**
 * remark 插件：注册 ++ / == 的 micromark 与 mdast 扩展。
 * 必须是普通 function（依赖 unified 注入的 this.data）。
 */
export function remarkTyporaMarks() {
  const data = this.data();
  const micromarkExtensions = data.micromarkExtensions || (data.micromarkExtensions = []);
  const fromMarkdownExtensions = data.fromMarkdownExtensions || (data.fromMarkdownExtensions = []);

  micromarkExtensions.push(typoraMarks());
  fromMarkdownExtensions.push(typoraMarksFromMarkdown());
}
