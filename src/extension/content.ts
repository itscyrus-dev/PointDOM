import type { Selection } from '../shared/contracts.js';
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
  host.style.cssText = 'all:initial;position:fixed;inset:0;pointer-events:none;z-index:2147483647';
  const root = host.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent =
    '.box{position:fixed;outline:2px solid #a8ff00;border-radius:5px;background:#a8ff0016;pointer-events:none}.hint{position:fixed;left:50%;top:12px;transform:translateX(-50%);font:13px system-ui;background:#191919;color:#f5f5f5;border:1px solid #414141;padding:10px 16px;border-radius:12px;box-shadow:0 8px 28px #0005}.hidden{display:none}';
  const box = document.createElement('div');
  box.className = 'box';
  const hint = document.createElement('div');
  hint.className = 'hint';
  hint.textContent = 'PagePatch · 点击要修改的元素，再按选取快捷键或 Esc 退出';
  root.append(style, box, hint);
  const getTarget = (event: Event) => {
    if (event.composedPath().some((n) => n instanceof Element && n.id === 'pagepatch-toolbar'))
      return null;
    const element = event.composedPath().find((n) => n instanceof Element);
    if (!(element instanceof Element) || element === host) return null;
    return element.closest('button,a,input,textarea,select,[role="button"],img') ?? element;
  };
  function selectorFor(element: Element) {
    const parts: string[] = [];
    let current: Element | null = element;
    while (current && current !== document.documentElement) {
      if (current.id) {
        parts.unshift(`#${CSS.escape(current.id)}`);
        break;
      }
      const tag = current.tagName.toLowerCase();
      const children: Element[] = Array.from(current.parentElement?.children ?? []).filter(
        (e) => e.tagName === current?.tagName,
      );
      parts.unshift(`${tag}:nth-of-type(${children.indexOf(current) + 1})`);
      current = current.parentElement;
    }
    return parts.join(' > ');
  }
  function capture(element: Element): Selection {
    const computed = getComputedStyle(element),
      rect = element.getBoundingClientRect();
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
    // Read labels, never input values, cookies, hidden DOM or the full page HTML.
    const label =
      element.getAttribute('aria-label') ||
      element.getAttribute('alt') ||
      (element.matches('input,textarea,select,[contenteditable]')
        ? element.tagName
        : (element as HTMLElement).innerText || element.tagName);
    return {
      url: location.origin + location.pathname,
      title: document.title.slice(0, 300),
      selector: selectorFor(element).slice(0, 3000),
      label: label.slice(0, 500),
      tag: element.tagName.toLowerCase(),
      viewport: { width: innerWidth, height: innerHeight },
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      styles,
    };
  }
  function move(event: PointerEvent) {
    const target = getTarget(event);
    if (!target) return;
    const r = target.getBoundingClientRect();
    box.style.cssText = `top:${r.top}px;left:${r.left}px;width:${r.width}px;height:${r.height}px`;
  }
  let chosen: Selection | null = null;
  function down(event: PointerEvent) {
    const target = getTarget(event);
    if (!target) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    chosen = capture(target);
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
        hint.textContent = result?.ok
          ? `已选 ${result.count} 个 · 继续点选，Esc 结束`
          : result?.error || '选取失败，请重试';
      })
      .catch(() => {
        hint.textContent = '连接已失效，请重新打开扩展';
      });
    // Keep intercepting page clicks until the user explicitly exits selection.
  }
  function click(event: MouseEvent) {
    if (!getTarget(event)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }
  function key(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopImmediatePropagation();
      stop();
    }
  }
  function clear() {
    box.style.cssText = 'display:none';
  }
  function stop() {
    enabled = false;
    host.remove();
    chosen = null;
    window.removeEventListener('pointermove', move, true);
    window.removeEventListener('pointerdown', down, true);
    window.removeEventListener('pointerup', up, true);
    window.removeEventListener('click', click, true);
    window.removeEventListener('keydown', key, true);
    window.removeEventListener('scroll', clear, true);
  }
  function toggle() {
    if (enabled) {
      stop();
      return;
    }
    clear();
    enabled = true;
    document.documentElement.append(host);
    hint.textContent = 'PagePatch · 点击要修改的元素，再按选取快捷键或 Esc 退出';
    window.addEventListener('pointermove', move, true);
    window.addEventListener('pointerdown', down, true);
    window.addEventListener('pointerup', up, true);
    window.addEventListener('click', click, true);
    window.addEventListener('keydown', key, true);
    window.addEventListener('scroll', clear, true);
  }
  chrome.runtime.onMessage.addListener((message, sender, reply) => {
    if (sender.id !== chrome.runtime.id || message?.type !== 'PAGEPATCH_STOP_PICKER') return;
    stop();
    reply({ ok: true });
  });
  state[flag] = { toggle };
  toggle();
})();
