import type { Selection } from '../shared/contracts.js';
import { pickerPalette } from './ui-palette.js';
import { domSnapshot, elementBounds, parentElementOf, selectorPathFor } from './dom-context.js';
import { elementLabel } from './element-info.js';
// Isolated-world script, injected only following the user's explicit selection action.
(() => {
  const flag = '__pagepatchPicker';
  const state = globalThis as typeof globalThis & { __pagepatchPicker?: { toggle: () => void } };
  if (state[flag]) {
    state[flag].toggle();
    return;
  }
  let enabled = false;
  const host = document.createElement('div');
  host.dataset.pointdomPicker = '';
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText = 'all:initial;position:fixed;inset:0;pointer-events:none;z-index:2147483647';
  const root = host.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  const defaultPalette = pickerPalette('lime');
  // React Bits Crosshair interaction, implemented in the isolated picker without a React root.
  // Reference: https://reactbits.dev/animations/crosshair (target brackets and measurement).
  style.textContent = `
    :host { --picker-ink:#f1f2f3; --picker-surface:#191919; }
    * { box-sizing:border-box; pointer-events:none; }
    .box { position:fixed; top:0; left:0; background:var(--pdo-accent-soft); }
    .crosshair { position:fixed;inset:0;color:var(--pdo-accent); }
    .corner { position:fixed;left:0;top:0;width:14px;height:14px;border-style:solid;border-color:currentColor;filter:drop-shadow(0 0 1px #1119); }
    .corner:nth-of-type(1) { border-width:2px 0 0 2px; }
    .corner:nth-of-type(2) { border-width:2px 2px 0 0; }
    .corner:nth-of-type(3) { border-width:0 2px 2px 0; }
    .corner:nth-of-type(4) { border-width:0 0 2px 2px; }
    .dimensions { position:fixed;left:0;top:0;max-width:calc(100vw - 8px);padding:2px 6px;border-radius:4px;color:#f1f2f3;background:#191919;font:11px/1.5 ui-monospace,SFMono-Regular,monospace;white-space:nowrap; }
    .hint { position:fixed;left:50%;top:12px;transform:translateX(-50%);max-width:calc(100vw - 24px);font:12px/1.5 system-ui;color:var(--picker-ink);background:var(--picker-surface);border:1px solid #414141;padding:8px 12px;border-radius:10px;box-shadow:0 8px 28px #0005; }
    [hidden] { display:none!important; }
  `;
  const box = document.createElement('div');
  box.className = 'box';
  const crosshair = document.createElement('div');
  crosshair.className = 'crosshair';
  crosshair.hidden = true;
  // A separate wrapper keeps corner ordering independent of the label element.
  const brackets = document.createElement('div');
  const corners = Array.from({ length: 4 }, () => {
    const corner = document.createElement('div');
    corner.className = 'corner';
    brackets.append(corner);
    return corner;
  });
  const dimensions = document.createElement('div');
  dimensions.className = 'dimensions';
  crosshair.append(brackets, dimensions);
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
  const hint = document.createElement('div');
  hint.className = 'hint';
  let english = false;
  let count = 0;
  let mode: 'dark' | 'light' | 'system' = 'dark';
  let darkColor: string = defaultPalette.darkColor;
  let lightColor: string = defaultPalette.lightColor;
  const colorScheme = matchMedia('(prefers-color-scheme: dark)');
  function applyColor() {
    const color = (mode === 'system' ? colorScheme.matches : mode === 'dark')
      ? darkColor
      : lightColor;
    host.style.setProperty('--pdo-accent', color);
    host.style.setProperty('--pdo-accent-soft', color + '16');
  }
  const text = (zh: string, en: string) => (english ? en : zh);
  function updateHint() {
    hint.textContent = count
      ? text(
          `已选 ${count} 个 · Alt ↑↓ 层级 · Esc 结束`,
          `${count} selected · Alt ↑↓ levels · Esc to finish`,
        )
      : text('点击元素 · Alt ↑↓ 层级 · Esc 结束', 'Click elements · Alt ↑↓ levels · Esc to finish');
  }
  function appearance(value: unknown) {
    if (!value || typeof value !== 'object') return;
    english = 'language' in value && value.language === 'en';
    const validColor = (color: unknown): color is string =>
      typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color);
    if (
      'mode' in value &&
      (value.mode === 'light' || value.mode === 'dark' || value.mode === 'system')
    )
      mode = value.mode;
    if ('color' in value && validColor(value.color)) darkColor = value.color;
    if ('darkColor' in value && validColor(value.darkColor)) darkColor = value.darkColor;
    if ('lightColor' in value && validColor(value.lightColor)) lightColor = value.lightColor;
    applyColor();
    updateHint();
  }
  updateHint();
  root.append(style, box, crosshair, hint);
  const getTarget = (event: Event) => {
    if (event.composedPath().some((n) => n instanceof Element && n.id === 'pagepatch-toolbar'))
      return null;
    if (event.composedPath().includes(host)) return null;
    const element = event.composedPath().find((n) => n instanceof Element);
    if (!(element instanceof Element) || element === host) return null;
    return element;
  };
  function capture(element: Element): Selection {
    const computed = getComputedStyle(element),
      rect = elementBounds(element);
    const styles: Record<string, string> = {};
    for (const key of [
      'display',
      'width',
      'height',
      'padding',
      'margin',
      'gap',
      'font-size',
      'font-weight',
      'line-height',
      'color',
      'background-color',
      'border-radius',
      'border',
      'box-shadow',
    ])
      styles[key] = computed.getPropertyValue(key).slice(0, 200);
    const label = elementLabel(element);
    const selectorPath = selectorPathFor(element);
    const selector = selectorPath.join(' >>> ');
    if (selector.length > 3000) throw new Error('Element selector is too long');
    return {
      url: location.origin + location.pathname,
      title: document.title.slice(0, 300),
      selector,
      ...(selectorPath.length > 1 ? { selectorPath } : {}),
      dom: domSnapshot(element),
      label: label.slice(0, 500),
      tag: element.tagName.toLowerCase(),
      ...(element.getAttribute('role') ? { role: element.getAttribute('role')!.slice(0, 40) } : {}),
      viewport: { width: innerWidth, height: innerHeight },
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      styles,
    };
  }
  let frame = 0;
  let targetElement: Element | null = null;
  let pointer = { x: 0, y: 0, fine: false };
  let motion: number[] | null = null;
  let lastPaint = 0;
  function paint(now: number) {
    frame = 0;
    if (!enabled || !targetElement?.isConnected) {
      clear();
      return;
    }
    const r = elementBounds(targetElement);
    box.style.cssText = `transform:translate3d(${r.left}px,${r.top}px,0);width:${r.width}px;height:${r.height}px`;
    box.hidden = false;
    crosshair.hidden = false;
    const goal = [r.left - 5, r.top - 5, r.right + 5, r.bottom + 5];
    const animate = pointer.fine && !reducedMotion.matches;
    if (!motion) motion = [pointer.x, pointer.y, pointer.x, pointer.y];
    const dt = Math.min(50, Math.max(1, now - lastPaint));
    lastPaint = now;
    const follow = animate ? 1 - Math.exp(-dt / 65) : 1;
    let settling = false;
    motion = motion.map((value, index) => {
      const next = value + (goal[index]! - value) * follow;
      if (Math.abs(goal[index]! - next) <= 0.1) return goal[index]!;
      settling = true;
      return next;
    });
    const [left = r.left - 5, top = r.top - 5, right = r.right + 5, bottom = r.bottom + 5] = motion;
    const points = [
      [left, top],
      [right - 14, top],
      [right - 14, bottom - 14],
      [left, bottom - 14],
    ];
    corners.forEach((corner, index) => {
      const point = points[index]!;
      corner.style.transform = `translate3d(${point[0]}px,${point[1]}px,0)`;
    });
    dimensions.textContent = `${Math.round(r.width)} × ${Math.round(r.height)}`;
    const labelX = Math.max(50, Math.min(innerWidth - 50, (left + right) / 2));
    const labelY = bottom + 6 < innerHeight - 26 ? bottom + 6 : Math.max(4, top - 26);
    dimensions.style.transform = `translate3d(${labelX}px,${labelY}px,0) translateX(-50%)`;
    // Wake for pointer changes and settling only; never keep an idle animation loop alive.
    if (settling) frame = requestAnimationFrame(paint);
  }
  function move(event: PointerEvent) {
    if (
      levelLocked &&
      Math.abs(event.clientX - pointer.x) < 2 &&
      Math.abs(event.clientY - pointer.y) < 2
    )
      return;
    levelLocked = false;
    const target = getTarget(event);
    if (!target) {
      clear();
      return;
    }
    pointer = {
      x: event.clientX,
      y: event.clientY,
      fine: event.pointerType === 'mouse' && finePointer.matches,
    };
    targetElement = target;
    if (!frame) {
      lastPaint = performance.now();
      frame = requestAnimationFrame(paint);
    }
  }
  let levelLocked = false;
  const hierarchyChildren = new WeakMap<Element, Element>();
  let chosen: Selection | null = null;
  function down(event: PointerEvent) {
    const target = levelLocked ? targetElement : getTarget(event);
    if (!target) return;
    if (!levelLocked) move(event);
    event.preventDefault();
    event.stopImmediatePropagation();
    try {
      chosen = capture(target);
    } catch {
      chosen = null;
      hint.textContent = text(
        '此元素无法精确定位，请重新选取',
        'Cannot locate this element precisely. Select again.',
      );
    }
  }
  function up(event: PointerEvent) {
    if (!chosen) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const value = chosen;
    chosen = null;
    void chrome.runtime
      .sendMessage({ type: 'PAGEPATCH_SELECTED', selection: value })
      .then((result) => {
        if (result?.ok) {
          count = result.count;
          updateHint();
        } else
          hint.textContent =
            result?.error || text('选取失败，请重试', 'Selection failed. Try again.');
      })
      .catch(() => {
        hint.textContent = text(
          '连接已失效，请重新打开扩展',
          'Connection lost. Reopen the extension.',
        );
      });
    // Keep intercepting page clicks until the user explicitly exits selection.
  }
  function click(event: MouseEvent) {
    if (!getTarget(event)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }
  function key(event: KeyboardEvent) {
    if (
      event.altKey &&
      !event.ctrlKey &&
      !event.metaKey &&
      ['ArrowUp', 'ArrowDown'].includes(event.key) &&
      targetElement
    ) {
      event.preventDefault();
      event.stopImmediatePropagation();
      const previous = targetElement;
      let next: Element | null = null;
      if (event.key === 'ArrowUp') {
        next = parentElementOf(previous);
        if (next) hierarchyChildren.set(next, previous);
      } else {
        next =
          hierarchyChildren.get(previous) ||
          Array.from(previous.shadowRoot?.children || previous.children).find((child) => {
            const r = elementBounds(child);
            return (
              r.width > 0 &&
              r.height > 0 &&
              getComputedStyle(child).visibility === 'visible' &&
              pointer.x >= r.left &&
              pointer.x <= r.right &&
              pointer.y >= r.top &&
              pointer.y <= r.bottom
            );
          }) ||
          null;
      }
      if (next && next !== host && next.isConnected) {
        targetElement = next;
        levelLocked = true;
        hint.textContent =
          `${next.localName} · ${elementLabel(next).slice(0, 40)} · ` +
          text('Alt ↑↓ 层级 · Esc 结束', 'Alt ↑↓ levels · Esc to finish');
        motionChanged();
      }
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopImmediatePropagation();
      stop();
    }
  }
  function clear() {
    cancelAnimationFrame(frame);
    frame = 0;
    targetElement = null;
    levelLocked = false;
    box.hidden = true;
    crosshair.hidden = true;
    motion = null;
  }
  function motionChanged() {
    if (enabled && targetElement && !frame) {
      lastPaint = performance.now();
      frame = requestAnimationFrame(paint);
    }
  }
  function leave(event: PointerEvent) {
    if (!event.relatedTarget) clear();
  }
  function reportState() {
    void chrome.runtime
      .sendMessage({ type: 'POINTDOM_PICKER_STATE', active: enabled })
      .catch(() => {});
  }
  function stop() {
    const wasEnabled = enabled;
    enabled = false;
    clear();
    host.remove();
    chosen = null;
    window.removeEventListener('pointermove', move, true);
    window.removeEventListener('pointerdown', down, true);
    window.removeEventListener('pointerup', up, true);
    window.removeEventListener('click', click, true);
    window.removeEventListener('auxclick', click, true);
    window.removeEventListener('dblclick', click, true);
    window.removeEventListener('keydown', key, true);
    window.removeEventListener('scroll', clear, true);
    window.removeEventListener('resize', clear);
    window.removeEventListener('blur', clear);
    window.removeEventListener('pointerout', leave, true);
    reducedMotion.removeEventListener('change', motionChanged);
    finePointer.removeEventListener('change', clear);
    colorScheme.removeEventListener('change', applyColor);
    if (wasEnabled) reportState();
  }
  function toggle() {
    if (enabled) {
      stop();
      return;
    }
    clear();
    enabled = true;
    document.documentElement.append(host);
    count = 0;
    updateHint();
    void chrome.runtime
      .sendMessage({ type: 'POINTDOM_PICKER_APPEARANCE' })
      .then(appearance)
      .catch(() => {});
    window.addEventListener('pointermove', move, true);
    window.addEventListener('pointerdown', down, true);
    window.addEventListener('pointerup', up, true);
    window.addEventListener('click', click, true);
    window.addEventListener('auxclick', click, true);
    window.addEventListener('dblclick', click, true);
    window.addEventListener('keydown', key, true);
    window.addEventListener('scroll', clear, true);
    window.addEventListener('resize', clear);
    window.addEventListener('blur', clear);
    window.addEventListener('pointerout', leave, true);
    reducedMotion.addEventListener('change', motionChanged);
    finePointer.addEventListener('change', clear);
    colorScheme.addEventListener('change', applyColor);
    reportState();
  }
  chrome.runtime.onMessage.addListener((message, sender, reply) => {
    if (sender.id !== chrome.runtime.id) return;
    if (message?.type === 'POINTDOM_APPEARANCE') {
      appearance(message);
      return;
    }
    if (message?.type === 'POINTDOM_GET_PICKER_STATE') {
      reply({ active: enabled });
      return;
    }
    if (message?.type !== 'PAGEPATCH_STOP_PICKER') return;
    stop();
    reply({ ok: true });
  });
  state[flag] = { toggle };
  toggle();
})();
