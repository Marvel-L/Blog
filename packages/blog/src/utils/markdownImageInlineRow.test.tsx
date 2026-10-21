import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import ReactMarkdown from 'react-markdown';
import { remarkPostBasePlugins } from './markdownPlugins';
import { imageFigureLayoutClass, resolveImageDisplayOptions } from './markdownImageDisplay';

describe('inline image row (ReactMarkdown)', () => {
  it('同段多张 {.inline} 渲染为横排容器且 figure 带 data-inline', () => {
    const components = {
      div: ({ children, className, ...props }: React.HTMLAttributes<HTMLDivElement> & { node?: unknown }) => {
        const { node: _node, ...rest } = props as React.HTMLAttributes<HTMLDivElement> & { node?: unknown };
        const role = (rest as Record<string, unknown>)['data-role'];
        const isRow =
          role === 'markdown-image-row' || (typeof className === 'string' && className.includes('markdown-image-row'));
        if (isRow) {
          return (
            <div data-testid="image-row" data-role="markdown-image-row" className="markdown-image-row" {...rest}>
              {children}
            </div>
          );
        }
        return (
          <div className={className} {...rest}>
            {children}
          </div>
        );
      },
      img: ({ src, alt, title, className }: React.ImgHTMLAttributes<HTMLImageElement>) => {
        const display = resolveImageDisplayOptions(className as string | string[] | undefined, title);
        return (
          <figure
            data-role="markdown-figure"
            data-size={display.size === 'default' ? undefined : display.size}
            data-inline={display.inline ? true : undefined}
            className={imageFigureLayoutClass(display)}
          >
            <img src={src} alt={alt} />
          </figure>
        );
      },
    };

    const { getByTestId, container } = render(
      <ReactMarkdown remarkPlugins={remarkPostBasePlugins} components={components}>
        {'![a](a.jpg){.inline} ![b](b.jpg){.inline}'}
      </ReactMarkdown>,
    );

    const row = getByTestId('image-row');
    expect(row.querySelectorAll('figure[data-inline]')).toHaveLength(2);
    expect(row.querySelectorAll('figure[data-size="small"]')).toHaveLength(2);
    expect(container.querySelector('p')).toBeNull();
  });
});
