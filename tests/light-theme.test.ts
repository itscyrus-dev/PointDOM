import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gray, grayDark, blue, blueDark } from '@radix-ui/colors';
import { logoSvg } from '../src/extension/brand.js';
import { uiTheme } from '../src/extension/ui-palette.js';

function luminance(hex: string): number {
  const [r = 0, g = 0, b = 0] = hex
    .slice(1)
    .match(/../g)!
    .map((part) => {
      const channel = Number.parseInt(part, 16) / 255;
      return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

test('Radix semantic roles keep readable controls and labels in both appearances', () => {
  for (const theme of [uiTheme.light, uiTheme.dark]) {
    const pairs = [
      [theme.text, theme.card],
      [theme.muted, theme.card],
      [theme['selection-ink'], theme.selection],
      [theme['running-ink'], theme.running],
      [theme['completed-ink'], theme.completed],
      ...['primary', 'primary-hover', 'primary-pressed'].map((role) => [
        theme['primary-ink'],
        theme[role as 'primary'],
      ]),
    ];
    for (const [foreground, background] of pairs) {
      const a = luminance(foreground!);
      const b = luminance(background!);
      const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      assert.ok(ratio >= 4.5, `${foreground} on ${background}: ${ratio.toFixed(2)}`);
    }
    assert.notEqual(theme['disabled-ink'], theme['control-ink']);
  }
});

test('both appearances use official Radix Gray and Blue scales', () => {
  assert.equal(uiTheme.light.page, gray.gray1);
  assert.equal(uiTheme.light.card, gray.gray2);
  assert.equal(uiTheme.light.control, gray.gray3);
  assert.equal(uiTheme.light['control-hover'], gray.gray4);
  assert.equal(uiTheme.light.selection, gray.gray3);
  assert.equal(uiTheme.light.primary, blue.blue11);
  assert.equal(uiTheme.light['navigation-ink'], blue.blue9);
  assert.equal(uiTheme.dark.page, grayDark.gray1);
  assert.equal(uiTheme.dark.card, grayDark.gray2);
  assert.equal(uiTheme.dark.control, grayDark.gray3);
  assert.equal(uiTheme.dark['control-hover'], grayDark.gray4);
  assert.equal(uiTheme.dark.selection, grayDark.gray3);
  assert.equal(uiTheme.dark.primary, blueDark.blue11);
  assert.equal(uiTheme.dark['navigation-ink'], blueDark.blue9);
});

test('logo artwork shares the blue UI accent', () => {
  assert.match(logoSvg(), /stop-color="#0090ff"/);
  assert.doesNotMatch(logoSvg(), /#a8ff00|#d3ff7a/);
});
