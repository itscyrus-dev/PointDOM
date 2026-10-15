import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanLabel, shortLabel, elementType, styleGroups } from '../src/extension/element-info.js';
test('selection summaries normalize whitespace and shorten Unicode text without mutating full labels', () => {
  assert.equal(cleanLabel('  First\n  second \t'), 'First second');
  const item = { label: '😀'.repeat(40), tag: 'button' };
  assert.equal(Array.from(shortLabel(item)).length, 33);
  assert.equal(item.label, '😀'.repeat(40));
  assert.equal(shortLabel({ label: '\n ', tag: 'div' }), 'div');
  assert.deepEqual(elementType({ tag: 'div', role: 'button' }), ['按钮', 'Button']);
});
test('style groups omit trivial values by default and preserve the complete captured snapshot', () => {
  const styles = {
    display: 'flex',
    width: '100px',
    height: '36px',
    gap: 'normal',
    padding: '0px',
    margin: '0px 0px',
    color: 'rgb(20, 20, 20)',
    'background-color': 'rgba(0, 0, 0, 0)',
    border: '0px none rgb(20, 20, 20)',
    'border-radius': '0px',
    'box-shadow': 'none',
    position: 'relative',
  };
  const original = structuredClone(styles);
  const compact = Object.fromEntries(styleGroups(styles, false).flatMap((group) => group.entries));
  assert.equal(compact.display, 'flex');
  assert.equal(compact.width, '100px');
  assert.equal('box-shadow' in compact, false);
  assert.equal('background-color' in compact, false);
  assert.equal('padding' in compact, false);
  assert.deepEqual(
    Object.fromEntries(styleGroups(styles, true).flatMap((group) => group.entries)),
    styles,
  );
  assert.deepEqual(styles, original);
});
