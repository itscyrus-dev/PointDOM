import { z } from 'zod';

const originsSchema = z
  .array(z.url())
  .transform((urls) => [
    ...new Set(urls.filter((url) => /^https?:\/\//.test(url)).map((url) => new URL(url).origin)),
  ]);
const projectsSchema = z.object({
  projects: z.array(z.object({ origins: originsSchema })),
});

/** Opening local setup never grants access to page contents or task execution. */
export function isLocalDevelopmentUrl(value?: string) {
  if (!value) return false;
  try {
    const url = new URL(value);
    return (
      ['http:', 'https:'].includes(url.protocol) &&
      !url.username &&
      !url.password &&
      ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    );
  } catch {
    return false;
  }
}

/** The allowlist comes only from the authenticated local bridge, never a web page. */
export class SiteScope {
  private origins: string[] = [];
  private token = '';
  private generation = 0;
  private loading: Promise<void> | undefined;

  allows(url?: string) {
    if (!this.token || !url || !/^https?:\/\//.test(url)) return false;
    try {
      return this.origins.includes(new URL(url).origin);
    } catch {
      return false;
    }
  }

  canOpen(url?: string) {
    return this.allows(url) || isLocalDevelopmentUrl(url);
  }

  async load() {
    const version = ++this.generation;
    this.token = '';
    this.origins = [];
    this.loading = undefined;
    const data = await chrome.storage.local.get(['bridgeToken', 'pointdomLinkedOrigins']);
    if (version !== this.generation) return;
    this.token = typeof data.bridgeToken === 'string' ? data.bridgeToken : '';
    this.origins = this.token
      ? (originsSchema.safeParse(data.pointdomLinkedOrigins).data ?? [])
      : [];
  }

  refresh() {
    if (this.loading) return this.loading;
    const request = this.readProjects().finally(() => {
      if (this.loading === request) this.loading = undefined;
    });
    this.loading = request;
    return request;
  }

  private async readProjects() {
    const version = this.generation;
    if (!this.token) return;
    try {
      const response = await fetch('http://127.0.0.1:4318/api/projects', {
        headers: { Authorization: `Bearer ${this.token}`, 'X-PagePatch-Client': chrome.runtime.id },
        signal: AbortSignal.timeout(4000),
      });
      if (version !== this.generation) return;
      if (response.status === 401 || response.status === 403) {
        this.origins = [];
      } else {
        if (!response.ok) return;
        const data: unknown = await response.json();
        if (version !== this.generation) return;
        this.origins = [...new Set(projectsSchema.parse(data).projects.flatMap((p) => p.origins))];
      }
      await chrome.storage.local.set({ pointdomLinkedOrigins: this.origins });
    } catch {
      // Keep the last authenticated allowlist while the local bridge is offline.
    }
  }

  async syncTab(tab: chrome.tabs.Tab) {
    if (tab.id === undefined) return;
    const enabled = this.canOpen(tab.url);
    await chrome.sidePanel.setOptions({ tabId: tab.id, path: 'panel.html', enabled });
    await chrome.action.setTitle({
      tabId: tab.id,
      title: enabled ? 'PointDOM' : 'PointDOM · 仅在已关联的项目网页中可用',
    });
    if (!this.allows(tab.url))
      await chrome.tabs.sendMessage(tab.id, { type: 'PAGEPATCH_STOP_PICKER' }).catch(() => {});
  }

  async syncAll() {
    const tabs = await chrome.tabs.query({});
    await Promise.allSettled(tabs.map((tab) => this.syncTab(tab)));
  }
}
