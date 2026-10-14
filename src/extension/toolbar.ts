// Migration shim for sites registered by older versions. No page UI is injected.
(() => {
  document.getElementById('pagepatch-toolbar')?.remove();
  const state = globalThis as typeof globalThis & { __pagepatchToolbar?: boolean };
  delete state.__pagepatchToolbar;
})();
