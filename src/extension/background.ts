import { selectionSchema, readSelections } from '../shared/contracts.js';
import { readPreferences } from './ui-preferences.js';
import { pickerPalette } from './ui-palette.js';
import { SiteScope } from './site-scope.js';
let selectionWrites = Promise.resolve();
void chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
const sites = new SiteScope();
const ready = (async () => {
  await chrome.sidePanel.setOptions({ enabled: false });
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  await sites.load();
  await sites.syncAll();
})();
void ready.catch(() => {});
const refreshSites = async () => {
  await ready;
  await sites.refresh();
  await sites.syncAll();
};
void refreshSites().catch(() => {});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes.bridgeToken) return;
  if (changes.bridgeToken.oldValue === changes.bridgeToken.newValue) return;
  void ready
    .then(async () => {
      await chrome.storage.local.remove('pointdomLinkedOrigins');
      await sites.load();
      await sites.syncAll();
      await sites.refresh();
      await sites.syncAll();
    })
    .catch(() => {});
});
chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (!info.url && info.status !== 'loading' && info.status !== 'complete') return;
  void ready.then(() => sites.syncTab({ ...tab, id: tabId })).catch(() => {});
  if (info.status === 'complete') void refreshSites().catch(() => {});
});
chrome.tabs.onActivated.addListener(({ tabId, windowId }) => {
  void ready
    .then(async () => {
      await sites.syncTab(await chrome.tabs.get(tabId));
      const tabs = await chrome.tabs.query({ windowId });
      await Promise.allSettled(
        tabs
          .filter((tab) => tab.id !== undefined && tab.id !== tabId)
          .map((tab) => chrome.tabs.sendMessage(tab.id!, { type: 'PAGEPATCH_STOP_PICKER' })),
      );
    })
    .catch(() => {});
});
chrome.permissions.onRemoved.addListener(() => {
  void refreshSites().catch(() => {});
});
chrome.action.onClicked.addListener((tab) => {
  // Use the cached allowlist so opening remains inside Chrome's user gesture.
  if (tab.id !== undefined && sites.allows(tab.url)) {
    void chrome.sidePanel
      .getOptions({ tabId: tab.id })
      .then(async (options) => {
        await sites.syncTab(tab);
        // Keep Chrome's native toggle on enabled tabs. A first activeTab grant
        // can enable and open its previously disabled panel on the same click.
        if (!options.enabled) await chrome.sidePanel.open({ tabId: tab.id! });
      })
      .catch(() => {});
  } else {
    void chrome.runtime.openOptionsPage();
  }
  void refreshSites().catch(() => {});
});
chrome.runtime.onMessage.addListener((message: unknown, sender, reply) => {
  if (typeof message !== 'object' || message === null) return;
  const control = message as { type?: string; tabId?: number };
  if (control.type === 'POINTDOM_SYNC_SITES' && sender.url?.startsWith(chrome.runtime.getURL(''))) {
    void refreshSites()
      .then(() => reply({ ok: true }))
      .catch(() => reply({ ok: false }));
    return true;
  }
  if (
    (control.type === 'PAGEPATCH_CLEAR_SELECTIONS' || control.type === 'POINTDOM_CLEAR_SELECTED') &&
    sender.url?.startsWith(chrome.runtime.getURL('')) &&
    Number.isInteger(control.tabId)
  ) {
    selectionWrites = selectionWrites
      .then(async () => {
        await chrome.storage.local.remove(
          control.type === 'POINTDOM_CLEAR_SELECTED'
            ? [`selection:${control.tabId}`]
            : [`selection:${control.tabId}`, `draft:${control.tabId}`],
        );
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
  if (!sites.allows(sender.url) || !sites.allows(sender.tab.url || sender.url)) {
    reply({ ok: false, error: '请在已关联的项目网页中使用 PointDOM。' });
    return;
  }
  if (control.type === 'POINTDOM_PICKER_APPEARANCE' && sender.id === chrome.runtime.id) {
    void chrome.storage.local
      .get('pointdomPreferences')
      .then((data) => {
        const preferences = readPreferences(data.pointdomPreferences);
        reply({
          language: preferences.language,
          mode: preferences.mode,
          ...pickerPalette(preferences.accent),
        });
      })
      .catch(() => reply({ language: 'zh-CN', mode: 'dark', ...pickerPalette('lime') }));
    return true;
  }
  const candidate = message as { type?: string; selection?: unknown };
  if (candidate.type === 'POINTDOM_PICKER_STATE') {
    reply({ ok: true });
    return;
  }
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

// The reserved _execute_action command invokes the extension action.
// A command invocation grants activeTab, just like clicking the extension action.
chrome.commands.onCommand.addListener((command, tab) => {
  if (command !== 'pick-element' || tab?.id === undefined) return;
  if (!sites.allows(tab.url)) return;
  const tabId = tab.id;
  void chrome.scripting
    .executeScript({ target: { tabId }, files: ['content.js'] })
    .then(async () => {
      await chrome.action.setBadgeText({ tabId, text: '' });
      await chrome.action.setTitle({ tabId, title: '打开 PointDOM' });
    })
    .catch(async () => {
      await chrome.action.setBadgeText({ tabId, text: '!' });
      await chrome.action.setTitle({
        tabId,
        title: '此页面无法选取元素，请在普通网页中使用 PointDOM',
      });
    });
});
