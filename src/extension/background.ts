import { selectionSchema, readSelections } from '../shared/contracts.js';
let selectionWrites = Promise.resolve();
void chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
chrome.runtime.onMessage.addListener((message: unknown, sender, reply) => {
  if (typeof message !== 'object' || message === null) return;
  const control = message as { type?: string; tabId?: number };
  if (
    control.type === 'PAGEPATCH_CLEAR_SELECTIONS' &&
    sender.url?.startsWith(chrome.runtime.getURL('')) &&
    Number.isInteger(control.tabId)
  ) {
    selectionWrites = selectionWrites
      .then(async () => {
        await chrome.storage.local.remove([`selection:${control.tabId}`, `draft:${control.tabId}`]);
        reply({ ok: true });
      })
      .catch(() => reply({ ok: false }));
    return true;
  }
  if (
    (message as { type?: string }).type === 'PAGEPATCH_DESCRIBE_SELECTION' &&
    sender.url?.startsWith(chrome.runtime.getURL(''))
  ) {
    const value = message as { tabId?: number; selector?: string; description?: string };
    if (
      !Number.isInteger(value.tabId) ||
      typeof value.selector !== 'string' ||
      typeof value.description !== 'string' ||
      value.description.length > 2000
    ) {
      reply({ ok: false });
      return;
    }
    selectionWrites = selectionWrites
      .then(async () => {
        const key = `selection:${value.tabId}`;
        const data = await chrome.storage.local.get(key);
        const items = readSelections(data[key]);
        const item = items.find((item) => item.selector === value.selector);
        if (item) {
          item.description = value.description;
          await chrome.storage.local.set({ [key]: items });
        }
        reply({ ok: !!item });
      })
      .catch(() => reply({ ok: false }));
    return true;
  }
  if (!sender.tab?.id) return;
  const candidate = message as { type?: string; selection?: unknown };
  if (candidate.type === 'PAGEPATCH_OPEN_PANEL') {
    void chrome.sidePanel
      .open({ tabId: sender.tab.id })
      .then(() => reply({ ok: true }))
      .catch((error) => reply({ ok: false, error: error.message }));
    return true;
  }
  if (candidate.type === 'PAGEPATCH_PICK') {
    void chrome.scripting
      .executeScript({ target: { tabId: sender.tab.id }, files: ['content.js'] })
      .then(() => reply({ ok: true }))
      .catch((error) => reply({ ok: false, error: error.message }));
    return true;
  }
  if (candidate.type !== 'PAGEPATCH_SELECTED') return;
  void chrome.sidePanel.open({ tabId: sender.tab.id }).catch(() => {});
  const parsed = selectionSchema.safeParse(candidate.selection);
  if (!parsed.success) {
    reply({ ok: false });
    return;
  }
  delete parsed.data.description; // Page content cannot supply user-authored instructions.
  const tabId = sender.tab.id;
  const source = sender.url || sender.tab.url;
  if (!source || new URL(source).origin !== new URL(parsed.data.url).origin) {
    reply({ ok: false });
    return;
  }
  selectionWrites = selectionWrites
    .then(async () => {
      const key = `selection:${tabId}`;
      const data = await chrome.storage.local.get(key);
      const items = readSelections(data[key]).filter((item) => item.url === parsed.data.url);
      const index = items.findIndex((item) => item.selector === parsed.data.selector);
      if (index >= 0) items[index] = { ...parsed.data, description: items[index]?.description };
      else if (items.length < 10) items.push(parsed.data);
      else {
        reply({ ok: false, error: '最多选取 10 个元素，请先移除部分元素。' });
        return;
      }
      await chrome.storage.local.set({ [key]: items });
      reply({ ok: true, count: items.length });
    })
    .catch(() => {
      reply({ ok: false, error: '保存选取失败，请重试。' });
    });
  return true;
});
chrome.tabs.onRemoved.addListener((tabId) => {
  void chrome.storage.local.remove([`selection:${tabId}`, `draft:${tabId}`]);
});

// The reserved _execute_action command uses Chrome's native side-panel toggle.
// A command invocation grants activeTab, just like clicking the extension action.
chrome.commands.onCommand.addListener((command, tab) => {
  if (command !== 'pick-element' || tab?.id === undefined) return;
  const tabId = tab.id;
  void chrome.scripting
    .executeScript({ target: { tabId }, files: ['content.js'] })
    .then(async () => {
      await chrome.action.setBadgeText({ tabId, text: '' });
      await chrome.action.setTitle({ tabId, title: '打开 PagePatch' });
    })
    .catch(async () => {
      await chrome.action.setBadgeText({ tabId, text: '!' });
      await chrome.action.setTitle({
        tabId,
        title: '此页面无法选取元素，请在普通网页中使用 PagePatch',
      });
    });
});
