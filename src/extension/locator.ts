import { selectionSchema } from '../shared/contracts.js';
import { cleanLabel, elementLabel } from './element-info.js';
import { elementBounds, resolveSelection } from './dom-context.js';
import { brandAccent } from './ui-palette.js';

(() => {
  const state = globalThis as typeof globalThis & { __pointdomLocator?: boolean };
  if (state.__pointdomLocator) return;
  state.__pointdomLocator = true;
  let cleanup = () => {};
  chrome.runtime.onMessage.addListener((message: unknown, sender, reply) => {
    if (
      sender.id !== chrome.runtime.id ||
      !sender.url?.startsWith(chrome.runtime.getURL('')) ||
      !message ||
      typeof message !== 'object' ||
      !('type' in message) ||
      message.type !== 'POINTDOM_LOCATE_ELEMENT' ||
      !('selection' in message)
    )
      return;
    const parsed = selectionSchema.safeParse(message.selection);
    if (!parsed.success) {
      reply({ ok: false });
      return;
    }
    const item = parsed.data;
    if (location.origin + location.pathname !== item.url) {
      reply({ ok: false });
      return;
    }
    const target = resolveSelection(item);
    if (
      !target ||
      target.tagName.toLowerCase() !== item.tag ||
      (item.role !== undefined && target.getAttribute('role') !== item.role) ||
      cleanLabel(elementLabel(target)) !== cleanLabel(item.label)
    ) {
      reply({ ok: false });
      return;
    }
    const rect = elementBounds(target);
    if ((!rect.width && !rect.height) || getComputedStyle(target).visibility !== 'visible') {
      reply({ ok: false });
      return;
    }
    cleanup();
    const host = document.createElement('div');
    host.dataset.pointdomLocator = '';
    host.setAttribute('aria-hidden', 'true');
    host.style.cssText =
      'all:initial;position:fixed;inset:0;pointer-events:none;z-index:2147483647';
    const root = host.attachShadow({ mode: 'closed' });
    const box = document.createElement('div');
    box.style.cssText = `position:fixed;pointer-events:none;outline:2px solid ${brandAccent};outline-offset:4px;background:${brandAccent}16;border-radius:4px`;
    root.append(box);
    document.documentElement.append(host);
    let frame = 0;
    const paint = () => {
      frame = 0;
      if (!target.isConnected) {
        cleanup();
        return;
      }
      const r = elementBounds(target);
      box.style.top = `${r.top}px`;
      box.style.left = `${r.left}px`;
      box.style.width = `${r.width}px`;
      box.style.height = `${r.height}px`;
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(paint);
    };
    const timer = setTimeout(() => cleanup(), 1400);
    cleanup = () => {
      clearTimeout(timer);
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule, true);
      window.removeEventListener('resize', schedule);
      host.remove();
    };
    window.addEventListener('scroll', schedule, true);
    window.addEventListener('resize', schedule);
    target.scrollIntoView({
      block: 'center',
      inline: 'nearest',
      behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    });
    paint();
    reply({ ok: true });
  });
})();
