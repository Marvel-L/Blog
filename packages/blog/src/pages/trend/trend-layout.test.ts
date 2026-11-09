// @vitest-environment node
import { readFileSync } from 'node:fs';
import postcss from 'postcss';
import { expect, it } from 'vitest';

const declarations = (stylesheet: ReturnType<typeof postcss.parse>, selector: string, property: string) => {
  const values: string[] = [];
  stylesheet.walkRules(selector, (rule) => {
    rule.walkDecls(property, (decl) => {
      values.push(decl.value.replace(/\s+/g, ' ').trim());
    });
  });
  return values;
};

it('云端浮球共用原账号基准，在完整账号球高上额外保留间距，所有断点均不覆写', () => {
  const root = postcss.parse(readFileSync(new URL('../../index.css', import.meta.url), 'utf8'));
  const trend = postcss.parse(readFileSync(new URL('./trend.css', import.meta.url), 'utf8'));
  // 保留原账号公式，包含导航、Cookie、更新提示与安全区，字体缩放时仍保持相同基准。
  expect(declarations(root, ':root', '--cloud-account-bottom')).toEqual([
    'calc( var(--tab-bar-height, 0px) + max( 1.25rem, var(--cookie-notice-height, 0px) + var(--service-worker-prompt-height, 0px) + env(safe-area-inset-bottom, 0px) + 1.25rem ) + 4rem )',
  ]);
  expect(declarations(trend, '.trend-sync-float--cloud', '--trend-sync-bottom')).toEqual(['var(--cloud-sync-bottom)']);
  expect(declarations(root, ':root', '--cloud-orb-size')).toEqual(['3.5rem']);
  expect(declarations(root, ':root', '--cloud-orb-right')).toEqual([
    'max(1rem, calc(env(safe-area-inset-right, 0px) + 1rem))',
  ]);
  expect(declarations(root, ':root', '--cloud-sync-bottom')).toEqual([
    'calc(var(--cloud-account-bottom) + var(--cloud-orb-size) + 0.75rem)',
  ]);
  // 同时覆盖 Planner，防止只修一个页面或窄屏规则重新覆盖 cloud 定位。
  const planner = postcss.parse(readFileSync(new URL('../planner/planner.css', import.meta.url), 'utf8'));
  for (const [stylesheet, prefix] of [
    [trend, 'trend'],
    [planner, 'planner'],
  ] as const) {
    const cloud = `.${prefix}-sync-float--cloud`;
    expect(declarations(stylesheet, cloud, 'right')).toEqual(['var(--cloud-orb-right)']);
    expect(declarations(stylesheet, `${cloud} .${prefix}-sync-orb`, 'width')).toEqual(['var(--cloud-orb-size)']);
    expect(declarations(stylesheet, `${cloud} .${prefix}-sync-orb`, 'height')).toEqual(['var(--cloud-orb-size)']);
    const mobile = `.${prefix}-sync-float:not(.${prefix}-sync-float--cloud)`;
    expect(declarations(stylesheet, mobile, 'right')).toHaveLength(1);
    expect(declarations(stylesheet, `.${prefix}-sync-float`, 'right')).toHaveLength(1);
  }
  expect(declarations(planner, '.planner-sync-float--cloud', 'bottom')).toEqual(['var(--cloud-sync-bottom)']);
  expect(declarations(planner, '.planner-sync-float--cloud .planner-sync-panel', 'max-height')).toEqual([
    'calc(100dvh - var(--cloud-sync-bottom) - 87px - env(safe-area-inset-top, 0px))',
  ]);
  expect(declarations(trend, '.trend-sync-float', 'bottom')).toEqual(['var(--trend-sync-bottom)']);
  // Pages 不带 cloud 类，仍使用原位置；详情面板高度跟随新的底部偏移。
  expect(declarations(trend, '.trend-sync-float', '--trend-sync-bottom')).toEqual([
    'calc( var(--tab-bar-height, 0px) + 92px + env(safe-area-inset-bottom) + var(--cookie-notice-height, 0px) + var(--service-worker-prompt-height, 0px) )',
  ]);
  expect(declarations(trend, '.trend-sync-panel', 'max-height')).toEqual([
    'calc(100dvh - var(--trend-sync-bottom) - 87px - env(safe-area-inset-top))',
  ]);
});
