// @vitest-environment node
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { RinArtwork } from './RinArtwork';

describe('RinArtwork', () => {
  it('渲染连续帧动画、暂停封面和三个互动热区', () => {
    const idle = renderToStaticMarkup(<RinArtwork />);
    const tea = renderToStaticMarkup(<RinArtwork reaction="tea" sequence={2} />);
    const paused = renderToStaticMarkup(<RinArtwork reaction="tea" sequence={2} paused />);
    expect(idle).toContain('data-generated-live2d="frame-animation"');
    expect(idle).toMatch(/<img\b[^>]*rin-anim-idle/);
    expect(tea).toMatch(/<img\b[^>]*rin-anim-tea/);
    expect(paused).toMatch(/<img\b[^>]*rin-live-base/);
    expect(tea).toContain('data-rin-touch="nod"');
    expect(tea).toContain('data-rin-touch="stretch"');
    expect(tea).toContain('data-rin-touch="wave"');
  });
});
