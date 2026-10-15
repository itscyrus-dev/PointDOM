import type { Selection } from '../shared/contracts.js';

export const cleanLabel = (value: string) => value.replace(/\s+/gu, ' ').trim().slice(0, 500);
const excluded =
  'input,textarea,select,[contenteditable]:not([contenteditable="false"]),[hidden],[aria-hidden="true"],script,style,noscript,template';

/** Read bounded rendered labels, never editable values or hidden subtrees. */
function visibleText(element: Element): string {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  const parts: string[] = [];
  let length = 0,
    visited = 0;
  while (visited++ < 300 && length < 500) {
    const node = walker.nextNode();
    if (!node) break;
    const parent = node.parentElement;
    if (!parent || parent.closest(excluded) || !parent.getClientRects().length) continue;
    const css = getComputedStyle(parent);
    if (css.visibility !== 'visible') continue;
    const text = cleanLabel(node.textContent || '');
    if (text) {
      parts.push(text);
      length += text.length;
    }
  }
  return cleanLabel(parts.join(' '));
}
export function elementLabel(element: Element): string {
  const root = element.getRootNode();
  const references =
    element.getAttribute('aria-labelledby')?.trim().split(/\s+/).slice(0, 10) || [];
  const labelled =
    root instanceof Document || root instanceof ShadowRoot
      ? references
          .map((id) => root.getElementById(id))
          .filter((node): node is HTMLElement => node instanceof HTMLElement)
          .map(visibleText)
          .join(' ')
      : '';
  const name = cleanLabel(labelled) || cleanLabel(element.getAttribute('aria-label') || '');
  if (name) return name;
  if (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement
  ) {
    const label = cleanLabel(
      Array.from(element.labels || [])
        .map(visibleText)
        .join(' '),
    );
    return (
      label || cleanLabel(element.getAttribute('title') || '') || element.tagName.toLowerCase()
    );
  }
  const attribute =
    cleanLabel(element.getAttribute('alt') || '') ||
    cleanLabel(element.getAttribute('title') || '');
  if (attribute) return attribute;
  if (
    element.matches(
      'div,section,article,main,aside,header,footer,nav,form,[role="region"],[role="group"]',
    ) &&
    !element.matches('[role="button"],[role="link"]')
  ) {
    for (const heading of Array.from(
      element.querySelectorAll('h1,h2,h3,h4,h5,h6,[role="heading"]'),
    ).slice(0, 20)) {
      const label = visibleText(heading);
      if (label) return label;
    }
  }
  return visibleText(element) || element.tagName.toLowerCase();
}
export function shortLabel(item: Pick<Selection, 'label' | 'tag'>) {
  const full = cleanLabel(item.label) || item.tag;
  const characters = Array.from(full);
  return characters.length > 32 ? characters.slice(0, 32).join('') + '…' : full;
}
export function elementType(item: Pick<Selection, 'tag' | 'role'>): [string, string] {
  if (/^h[1-6]$/.test(item.tag) || item.role === 'heading') return ['标题', 'Heading'];
  if (item.tag === 'button' || item.role === 'button') return ['按钮', 'Button'];
  if (item.tag === 'a' || item.role === 'link') return ['链接', 'Link'];
  if (
    [
      'svg',
      'path',
      'g',
      'circle',
      'rect',
      'line',
      'polyline',
      'polygon',
      'ellipse',
      'use',
    ].includes(item.tag)
  )
    return ['图标', 'Icon'];
  if (item.tag === 'img' || item.role === 'img') return ['图片', 'Image'];
  if (['input', 'textarea', 'select'].includes(item.tag)) return ['表单', 'Field'];
  if (['p', 'span', 'label', 'strong'].includes(item.tag)) return ['文字', 'Text'];
  return ['容器', 'Container'];
}
const definitions: { name: [string, string]; properties: string[] }[] = [
  { name: ['布局', 'Layout'], properties: ['display', 'width', 'height', 'gap'] },
  { name: ['间距', 'Spacing'], properties: ['padding', 'margin'] },
  { name: ['文字', 'Text'], properties: ['font-size', 'font-weight', 'line-height', 'color'] },
  {
    name: ['外观', 'Appearance'],
    properties: ['background-color', 'border-radius', 'border', 'box-shadow'],
  },
];
function trivial(property: string, value: string) {
  if (!value || value === 'none') return true;
  if (property === 'background-color')
    return value === 'transparent' || /^rgba\([^)]*,\s*0\s*\)$/.test(value);
  if (property === 'border') return /^0(?:px)?\s/.test(value) || value.includes(' none ');
  if (['gap', 'padding', 'margin', 'border-radius'].includes(property))
    return value === 'normal' || /^(?:0(?:px|em|rem|%)?\s*)+$/.test(value);
  return false;
}
export function styleGroups(styles: Record<string, string>, showAll: boolean) {
  const known = new Set(definitions.flatMap((group) => group.properties));
  const groups = [
    ...definitions,
    {
      name: ['其他', 'Other'] as [string, string],
      properties: Object.keys(styles).filter((key) => !known.has(key)),
    },
  ];
  return groups
    .map((group) => ({
      ...group,
      entries: group.properties
        .filter(
          (property) => property in styles && (showAll || !trivial(property, styles[property]!)),
        )
        .map((property) => [property, styles[property]!] as const),
    }))
    .filter((group) => group.entries.length);
}
