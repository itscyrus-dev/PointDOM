import { test } from 'node:test';
import assert from 'node:assert/strict';
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

test('action, selection and running labels meet normal-text contrast in both appearances', () => {
  const pairs = [
    [uiTheme.brand['accent-ink'], uiTheme.brand.accent],
    [uiTheme.brand['accent-ink'], uiTheme.brand['accent-hover']],
    [uiTheme.brand['accent-ink'], uiTheme.brand['accent-pressed']],
    [uiTheme.dark['completed-ink'], uiTheme.dark.completed],
    ...[uiTheme.light, uiTheme.dark].flatMap((theme) => [
      [theme['selection-ink'], theme.selection],
      [theme['selection-ink'], theme.navigation],
      [theme['running-ink'], theme.running],
    ]),
  ];
  for (const [foreground, background] of pairs) {
    const a = luminance(foreground!);
    const b = luminance(background!);
    const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    assert.ok(ratio >= 4.5, `${foreground} on ${background}: ${ratio.toFixed(2)}`);
  }
});

test('routine selection and completed states do not reuse the primary action fill', () => {
  for (const theme of [uiTheme.light, uiTheme.dark]) {
    assert.notEqual(theme.selection, uiTheme.brand.accent);
    assert.notEqual(theme.navigation, uiTheme.brand.accent);
    assert.notEqual(theme.completed, uiTheme.brand.accent);
  }
});

test('light controls and metadata use the requested neutral surfaces', () => {
  for (const role of ['navigation', 'selection', 'control-hover', 'control-pressed'] as const) {
    assert.equal(uiTheme.light[role], '#f4f4f5');
  }
  assert.equal(uiTheme.light.page, '#ffffff');
  assert.equal(uiTheme.light.card, '#f8f8f8');
  assert.equal(uiTheme.light.completed, '#eeeeee');
  assert.equal(uiTheme.light['completed-ink'], '#b8b8b8');
});
