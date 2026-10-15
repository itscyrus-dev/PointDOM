import type { Selection } from '../shared/contracts.js';
import { cleanLabel, elementLabel } from './element-info.js';

export function parentElementOf(element: Element): Element | null {
  const root = element.getRootNode();
  return element.parentElement || (root instanceof ShadowRoot ? root.host : null);
}
function unique(root: Document | ShadowRoot, selector: string, element: Element) {
  try {
    const matches = root.querySelectorAll(selector);
    return matches.length === 1 && matches[0] === element;
  } catch {
    return false;
  }
}
function localSelector(element: Element, root: Document | ShadowRoot): string {
  const parts: string[] = [];
  let current: Element | null = element;
  while (current) {
    for (const attribute of ['data-testid', 'data-test', 'data-cy', 'id']) {
      const value = current.getAttribute(attribute);
      if (!value || value.length > 200) continue;
      const anchor =
        attribute === 'id' ? `#${CSS.escape(value)}` : `[${attribute}="${CSS.escape(value)}"]`;
      if (!unique(root, anchor, current)) continue;
      const candidate = [anchor, ...parts].join(' > ');
      if (unique(root, candidate, element)) return candidate;
    }
    const tag = current.localName;
    const siblings = Array.from(current.parentElement?.children || root.children).filter(
      (node) => node.localName === tag,
    );
    parts.unshift(`${CSS.escape(tag)}:nth-of-type(${siblings.indexOf(current) + 1})`);
    current = current.parentElement;
  }
  const candidate = parts.join(' > ');
  if (unique(root, candidate, element)) return candidate;
  throw new Error('Element has no unique selector');
}
export function elementBounds(element: Element): DOMRect {
  const rect = element.getBoundingClientRect();
  if (rect.width || rect.height || getComputedStyle(element).display !== 'contents') return rect;
  const range = document.createRange();
  range.selectNodeContents(element);
  return range.getBoundingClientRect();
}
export function selectorPathFor(element: Element): string[] {
  const root = element.getRootNode();
  if (root instanceof Document) return [localSelector(element, root)];
  if (root instanceof ShadowRoot && root.mode === 'open') {
    const path = [...selectorPathFor(root.host), localSelector(element, root)];
    if (path.length <= 8) return path;
  }
  throw new Error('Unsupported element root');
}
/** Each root must have exactly one match; never fall back to a similar element. */
export function resolveSelection(
  item: Pick<Selection, 'selector' | 'selectorPath'>,
): Element | null {
  const path = item.selectorPath || [item.selector];
  if (item.selectorPath && path.join(' >>> ') !== item.selector) return null;
  let root: Document | ShadowRoot = document;
  let target: Element | undefined;
  try {
    for (let index = 0; index < path.length; index++) {
      const matches: NodeListOf<Element> = root.querySelectorAll(path[index]!);
      if (matches.length !== 1) return null;
      target = matches[0];
      if (index < path.length - 1) {
        if (!target?.shadowRoot) return null;
        root = target.shadowRoot;
      }
    }
  } catch {
    return null;
  }
  return target || null;
}

const allowedAttributes = [
  'id',
  'class',
  'role',
  'aria-label',
  'aria-labelledby',
  'alt',
  'title',
  'type',
  'data-testid',
  'data-test',
  'data-cy',
  'href',
  'src',
  'viewBox',
  'd',
  'fill',
];
const privateNodes =
  'input,textarea,select,[contenteditable]:not([contenteditable="false"]),script,style,noscript,template,iframe,object,embed';
const encoder = new TextEncoder();
function bounded(value: string, bytes: number) {
  if (encoder.encode(value).length <= bytes) return value;
  let result = '';
  for (const character of value) {
    if (encoder.encode(result + character).length > bytes) break;
    result += character;
  }
  return result;
}
function attributesOf(element: Element, onTruncated: () => void = () => {}) {
  const attributes: Record<string, string> = {};
  for (const name of allowedAttributes) {
    let value = element.getAttribute(name);
    if (!value) continue;
    if (name === 'href' || name === 'src') {
      try {
        const url = new URL(value, location.href);
        if (!['http:', 'https:'].includes(url.protocol)) continue;
        value = url.origin + url.pathname;
      } catch {
        continue;
      }
    }
    const cleaned = cleanLabel(value);
    attributes[name] = bounded(cleaned, 120);
    if (attributes[name] !== cleaned) onTruncated();
  }
  return attributes;
}
function summary(element: Element, onTruncated: () => void = () => {}) {
  return {
    tag: element.localName,
    attributes: attributesOf(element, onTruncated),
    label: bounded(elementLabel(element), 120),
  };
}
const escapeText = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
/** A bounded, non-executable DOM excerpt. Never includes live form values or arbitrary attributes. */
export function domSnapshot(element: Element): NonNullable<Selection['dom']> {
  let visited = 0,
    truncated = false,
    remaining = 3200;
  const serialize = (node: Node, depth: number): string => {
    if (++visited > 40 || depth > 4) {
      truncated = true;
      return '';
    }
    if (node.nodeType === Node.TEXT_NODE) {
      const text = cleanLabel(node.textContent || '');
      const limited = bounded(text, Math.min(240, Math.floor(remaining / 6)));
      if (text !== limited) truncated = true;
      const escaped = escapeText(limited);
      remaining -= encoder.encode(escaped).length;
      return escaped;
    }
    if (!(node instanceof Element)) return '';
    if (
      node.matches('[hidden],script,style,noscript,template') ||
      getComputedStyle(node).visibility !== 'visible' ||
      getComputedStyle(node).display === 'none'
    )
      return '';
    const attributes = Object.entries(
      attributesOf(node, () => {
        truncated = true;
      }),
    )
      .map(([key, value]) => ` ${key}="${escapeText(value)}"`)
      .join('');
    const open = `<${node.localName}${attributes}>`;
    const close = [
      'input',
      'img',
      'br',
      'hr',
      'wbr',
      'area',
      'base',
      'col',
      'embed',
      'link',
      'meta',
      'source',
      'track',
    ].includes(node.localName)
      ? ''
      : `</${node.localName}>`;
    const markupBytes = encoder.encode(open + close).length;
    if (markupBytes > remaining) {
      truncated = true;
      return '';
    }
    remaining -= markupBytes;
    const children: string[] = [];
    if (!node.closest(privateNodes)) {
      for (const child of node.childNodes) {
        if (visited >= 40) {
          truncated = true;
          break;
        }
        children.push(serialize(child, depth + 1));
      }
    }
    return open + children.join('') + close;
  };
  const html = serialize(element, 0);
  const ancestors: ReturnType<typeof summary>[] = [];
  let parent = parentElementOf(element);
  while (parent && ancestors.length < 4) {
    ancestors.push(
      summary(parent, () => {
        truncated = true;
      }),
    );
    parent = parentElementOf(parent);
  }
  const siblings: {
    relation: 'previous' | 'next';
    tag: string;
    attributes: Record<string, string>;
    label: string;
  }[] = [];
  if (element.previousElementSibling)
    siblings.push({
      relation: 'previous',
      ...summary(element.previousElementSibling, () => {
        truncated = true;
      }),
    });
  if (element.nextElementSibling)
    siblings.push({
      relation: 'next',
      ...summary(element.nextElementSibling, () => {
        truncated = true;
      }),
    });
  // Context only needs a small attribute sample for each surrounding node.
  for (const node of [...ancestors, ...siblings])
    node.attributes = Object.fromEntries(Object.entries(node.attributes).slice(0, 3));
  const snapshot = {
    capturedAt: new Date().toISOString(),
    html,
    attributes: attributesOf(element, () => {
      truncated = true;
    }),
    ancestors,
    siblings,
    truncated,
  };
  if (encoder.encode(JSON.stringify(snapshot)).length > 9500) {
    snapshot.html = '';
    snapshot.truncated = true;
  }
  return snapshot;
}
