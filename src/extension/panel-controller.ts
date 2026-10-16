import {
  newConnectionNonce,
  connectionChallenge,
  localInstallCommand,
  type InstallPlatform,
} from './local-install.js';
import { z } from 'zod';
import { agentContext } from '../shared/agent-context.js';
import {
  agentConnectionSchema,
  type AgentConnection,
  executorSchema,
  jobSchema,
  projectSchema,
  readSelections,
  type Job,
  type Project,
  type Selection,
  type Submission,
} from '../shared/contracts.js';
import { defaultPreferences, readPreferences, type Preferences } from './ui-preferences.js';
import { pickerPalette } from './ui-palette.js';

export function linkedSites(projects: readonly Project[]) {
  const sites = new Map<string, string[]>();
  for (const project of projects)
    for (const origin of project.origins) {
      if (!/^https?:\/\//.test(origin)) continue;
      const names = sites.get(origin) || [];
      if (!names.includes(project.name)) names.push(project.name);
      sites.set(origin, names);
    }
  return [...sites].map(([id, names]) => ({ id, name: `${names.join(' / ')} · ${id}` }));
}
export type Notice = { zh: string; en: string; error?: boolean };
export type PanelState = {
  ready: boolean;
  connection: 'offline' | 'connecting' | 'connected';
  pairingSaved: boolean;
  installPlatform: InstallPlatform | null;
  bootstrap: 'idle' | 'waiting' | 'available';
  settings: boolean;
  preferences: Preferences;
  projects: Project[];
  siteAccess: Record<string, boolean>;
  enablingOrigin: string;
  projectId: string;
  jobs: Job[];
  agents: AgentConnection[];
  recipientId: string;
  selections: Selection[];
  pickerActive: boolean;
  draft: string;
  tabId?: number;
  origin: string;
  page: Selection | null;
  submitting: boolean;
  notice: Notice | null;
  shortcuts: { pick: string; panel: string };
};
export class PanelController {
  private state: PanelState = {
    ready: false,
    connection: 'offline',
    pairingSaved: false,
    installPlatform: null,
    bootstrap: 'idle',
    settings: false,
    preferences: defaultPreferences,
    projects: [],
    siteAccess: {},
    enablingOrigin: '',
    projectId: '',
    jobs: [],
    agents: [],
    recipientId: '',
    selections: [],
    pickerActive: false,
    draft: '',
    origin: '',
    page: null,
    submitting: false,
    notice: null,
    shortcuts: { pick: '', panel: '' },
  };
  private listeners = new Set<() => void>();
  private token = '';
  private nonce = '';
  private discovering = false;
  private explicitProject = { origin: '', id: '' };
  private retry: Submission | null = null;
  private preferredAgent = '';
  private recipients = new Map<string, string>();
  private syncVersion = 0;
  private pickerVersion = 0;
  private accessVersion = 0;
  private connectVersion = 0;
  private refreshing: Promise<void> | null = null;
  private running = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  snapshot = () => this.state;
  private patch(value: Partial<PanelState>) {
    this.state = { ...this.state, ...value };
    for (const listener of this.listeners) listener();
  }
  notify(zh: string, en: string, error = false) {
    this.patch({ notice: { zh, en, error } });
  }
  clearNotice() {
    this.patch({ notice: null });
  }
  fail = (error: unknown) =>
    this.notify(
      error instanceof Error ? error.message : '操作失败',
      error instanceof Error ? error.message : 'Action failed',
      true,
    );
  private async api(path: string, body?: unknown): Promise<unknown> {
    const response = await fetch('http://127.0.0.1:4318' + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
        'X-PagePatch-Client': chrome.runtime.id,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(10000),
    });
    const value: unknown = await response.json();
    if (!response.ok) {
      const parsed = z.object({ error: z.string() }).safeParse(value);
      throw new Error(parsed.success ? parsed.data.error : `HTTP ${response.status}`);
    }
    return value;
  }
  private bindProjects(projects = this.state.projects) {
    const origin = this.state.origin;
    const matches = origin ? projects.filter((p) => p.origins.includes(origin)) : [];
    const projectId =
      matches.length === 1
        ? matches[0]!.id
        : this.explicitProject.origin === origin &&
            matches.some((p) => p.id === this.explicitProject.id)
          ? this.explicitProject.id
          : '';
    const projectChanged = projectId !== this.state.projectId;
    this.patch({
      projects,
      projectId,
      ...(projectChanged ? { jobs: [], agents: [], recipientId: '' } : {}),
      ...(matches.length > 1 && !projectId && this.state.connection === 'connected'
        ? { settings: true }
        : {}),
    });
    void chrome.runtime.sendMessage({ type: 'POINTDOM_SYNC_SITES' }).catch(() => {});
    void this.syncSiteAccess();
    if (projectChanged && this.running && this.state.connection === 'connected')
      void this.refresh();
  }
  private async syncSiteAccess() {
    const version = ++this.accessVersion;
    if (!chrome.permissions?.contains) return;
    const entries = await Promise.all(
      linkedSites(this.state.projects).map(async ({ id }) => {
        const granted = await chrome.permissions
          .contains({ origins: [`${id}/*`] })
          .catch(() => false);
        return [id, granted] as const;
      }),
    );
    if (version === this.accessVersion) this.patch({ siteAccess: Object.fromEntries(entries) });
  }
  private onPermissionsChanged = () => {
    void this.syncSiteAccess();
  };
  setSettings(settings: boolean) {
    this.patch({ settings });
  }
  setProject(id: string) {
    this.explicitProject = { origin: this.state.origin, id };
    this.retry = null;
    this.bindProjects();
  }
  setRecipient(id: string) {
    const agent = this.state.agents.find((agent) => agent.id === id);
    if (!agent) return;
    // An uncertain submission must keep its original ID and recipient until resolved.
    if (this.retry) {
      this.notify(
        '请先确认上次提交；已有任务可在卡片中改派。',
        'Resolve the previous submission first. Reassign existing tasks from their cards.',
        true,
      );
      return;
    }
    this.preferredAgent = agent.name;
    this.recipients.set(this.state.projectId, id);
    this.patch({ recipientId: id });
    void chrome.storage.local.set({ pointdomPreferredAgent: agent.name }).catch(this.fail);
  }
  setPreferences(value: Partial<Preferences>) {
    const preferences = readPreferences({ ...this.state.preferences, ...value });
    this.patch({ preferences });
    void chrome.storage.local.set({ pointdomPreferences: preferences }).catch(this.fail);
    if (this.state.tabId !== undefined)
      void chrome.tabs
        .sendMessage(this.state.tabId, {
          type: 'POINTDOM_APPEARANCE',
          language: preferences.language,
          mode: preferences.mode,
          ...pickerPalette(preferences.accent),
        })
        .catch(() => {
          /* A picker need not be active on the current page. */
        });
  }
  setDraft(draft: string) {
    this.retry = null;
    this.patch({ draft });
    if (this.state.tabId !== undefined)
      void chrome.storage.local.set({ [`draft:${this.state.tabId}`]: draft }).catch(this.fail);
  }
  async connect(
    code = this.token,
    { background = false }: { background?: boolean } = {},
  ): Promise<boolean> {
    if (!code.trim()) {
      this.notify('请先填写本机配对码', 'Enter the pairing code from this computer.', true);
      return false;
    }
    const previousToken = this.token;
    this.token = code.trim();
    let saved = false;
    const version = ++this.connectVersion;
    this.patch({ connection: 'connecting', ...(background ? {} : { notice: null }) });
    try {
      z.object({ defaultExecutor: executorSchema.optional() }).parse(
        await this.api('/api/pair', {}),
      );
      if (version !== this.connectVersion) return false;
      await chrome.storage.local.set({ bridgeToken: this.token });
      saved = true;
      if (version !== this.connectVersion) return false;
      this.patch({ pairingSaved: true });
      const projectResponse = z
        .object({ projects: z.array(projectSchema) })
        .parse(await this.api('/api/projects'));
      const projects = projectResponse.projects;
      if (version !== this.connectVersion) return false;
      // Polling restores connectivity without dismissing an open settings form.
      // Only an explicit successful connection should navigate back to annotations.
      this.patch({ connection: 'connected', ...(background ? {} : { settings: false }) });
      this.bindProjects(projects);
      await this.refresh();
      return true;
    } catch (error) {
      if (version !== this.connectVersion) return false;
      if (!saved) this.token = previousToken;
      this.patch({ connection: 'offline', ...(background ? {} : { settings: true }) });
      if (!background || !this.state.notice?.error) this.fail(error);
      return false;
    }
  }
  async copyInstallCommand() {
    if (!this.state.installPlatform)
      throw new Error('One-command installation is unavailable on this platform.');
    const command = localInstallCommand(
      this.state.installPlatform,
      chrome.runtime.id,
      await connectionChallenge(this.nonce),
      chrome.runtime.getManifest().version,
    );
    await navigator.clipboard.writeText(command);
    this.patch({ bootstrap: 'waiting' });
    await this.discover();
  }
  private async discover() {
    if (
      !this.running ||
      !/^[a-p]{32}$/.test(chrome.runtime.id) ||
      this.discovering ||
      !this.nonce ||
      this.state.connection !== 'offline'
    )
      return;
    this.discovering = true;
    const version = this.connectVersion;
    try {
      const response = await fetch('http://127.0.0.1:4318/api/bootstrap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nonce: this.nonce }),
        signal: AbortSignal.timeout(2000),
      });
      if (!response.ok || !this.running || version !== this.connectVersion) return;
      const parsed = z
        .object({
          available: z.literal(true),
          authorized: z.boolean(),
          token: z.string().min(32).optional(),
        })
        .safeParse(await response.json());
      if (!parsed.success || !this.running || version !== this.connectVersion) return;
      if (parsed.data.authorized && parsed.data.token) {
        if (await this.connect(parsed.data.token, { background: true })) {
          this.patch({ bootstrap: 'idle', notice: null });
        }
      } else if (this.state.bootstrap !== 'waiting') this.patch({ bootstrap: 'available' });
    } catch {
      // Service unavailable is an expected onboarding state, never proof that CLI is absent.
      if (this.running && this.state.bootstrap === 'available') this.patch({ bootstrap: 'idle' });
    } finally {
      this.discovering = false;
    }
  }
  refresh = async () => {
    if (this.state.connection !== 'connected') {
      if (this.token && this.state.connection !== 'connecting')
        await this.connect(this.token, { background: true });
      if (this.state.connection === 'offline') await this.discover();
      return;
    }
    if (this.refreshing) return this.refreshing;
    this.refreshing = this.readJobs().finally(() => {
      this.refreshing = null;
    });
    return this.refreshing;
  };
  private async readJobs() {
    while (this.running && this.state.connection === 'connected') {
      const projectId = this.state.projectId;
      try {
        const [projectResponse, incoming, agents] = await Promise.all([
          this.api('/api/projects').then((value) =>
            z
              .object({
                projects: z.array(projectSchema),
              })
              .parse(value),
          ),
          projectId
            ? this.api(`/api/jobs?projectId=${encodeURIComponent(projectId)}`).then(
                (value) => z.object({ jobs: z.array(jobSchema) }).parse(value).jobs,
              )
            : Promise.resolve([]),
          projectId
            ? this.api(`/api/agents?projectId=${encodeURIComponent(projectId)}`).then(
                (value) => z.object({ agents: z.array(agentConnectionSchema) }).parse(value).agents,
              )
            : Promise.resolve([]),
        ]);
        if (!this.running) return;
        const { projects } = projectResponse;
        if (JSON.stringify(projects) !== JSON.stringify(this.state.projects))
          this.bindProjects(projects);
        // A tab/project change invalidates this response; load the latest scope instead.
        if (projectId !== this.state.projectId) continue;
        // Older bridges may ignore the query. Never expose their foreign-project records.
        const jobs = incoming.filter((job) => job.projectId === projectId);
        if (JSON.stringify(jobs) !== JSON.stringify(this.state.jobs)) this.patch({ jobs });
        const scoped = agents.filter((agent) => agent.projectId === projectId);
        const saved = this.recipients.get(projectId);
        const preferred = scoped.filter((agent) => agent.name === this.preferredAgent);
        const recipientId = scoped.some((agent) => agent.id === saved)
          ? saved!
          : preferred.length === 1
            ? preferred[0]!.id
            : '';
        this.patch({ agents: scoped, recipientId });
        return;
      } catch (error) {
        if (!this.running) return;
        if (projectId !== this.state.projectId) continue;
        this.patch({ connection: 'offline' });
        this.fail(error);
        return;
      }
    }
  }
  private async syncTab() {
    const version = ++this.syncVersion;
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (version !== this.syncVersion) return;
    const origin = tab?.url && /^https?:/.test(tab.url) ? new URL(tab.url).origin : '';
    const page: Selection | null =
      origin && tab?.url
        ? {
            url: new URL(tab.url).origin + new URL(tab.url).pathname,
            title: (tab.title || '').slice(0, 300),
            label: '页面修改',
            selector: 'html',
            tag: 'html',
            viewport: {
              width: Math.min(20000, Math.max(1, tab.width || 1)),
              height: Math.min(20000, Math.max(1, tab.height || 1)),
            },
            rect: { x: 0, y: 0, width: 0, height: 0 },
            styles: {},
          }
        : null;
    const changed = this.state.tabId !== tab?.id;
    const contextChanged = changed || this.state.page?.url !== page?.url;
    if (contextChanged) ++this.pickerVersion;
    this.patch({
      origin,
      page,
      tabId: tab?.id,
      ...(contextChanged ? { pickerActive: false } : {}),
    });
    this.bindProjects();
    if (tab?.id !== undefined && origin) await this.readPickerState(tab.id);
    if (version !== this.syncVersion) return;
    if (!changed) return;
    this.retry = null;
    const data =
      tab?.id === undefined
        ? {}
        : await chrome.storage.local.get([`selection:${tab.id}`, `draft:${tab.id}`]);
    if (version !== this.syncVersion) return;
    const draft = data[`draft:${tab?.id}`];
    this.patch({
      selections: readSelections(data[`selection:${tab?.id}`]),
      draft: typeof draft === 'string' ? draft : '',
    });
  }
  private onStorage = (changes: { [key: string]: chrome.storage.StorageChange }, area: string) => {
    if (area !== 'local') return;
    if (changes.pointdomPreferences)
      this.patch({ preferences: readPreferences(changes.pointdomPreferences.newValue) });
    const value = changes[`selection:${this.state.tabId}`];
    if (!value) return;
    const incoming = readSelections(value.newValue);
    const sameKeys =
      JSON.stringify(incoming.map((s) => [s.url, s.selector])) ===
      JSON.stringify(this.state.selections.map((s) => [s.url, s.selector]));
    if (sameKeys && document.activeElement?.classList.contains('element-description')) return;
    if (JSON.stringify(incoming) === JSON.stringify(this.state.selections)) return;
    this.retry = null;
    this.patch({ selections: incoming });
    this.notify(
      incoming.length ? `已选 ${incoming.length} 个元素。` : '已清空选取。',
      incoming.length ? `${incoming.length} elements selected.` : 'Selection cleared.',
    );
  };
  private onTab = () => {
    void this.syncTab().catch(this.fail);
  };
  private onPickerState = (message: unknown, sender: chrome.runtime.MessageSender) => {
    const parsed = z
      .object({ type: z.literal('POINTDOM_PICKER_STATE'), active: z.boolean() })
      .safeParse(message);
    if (
      !parsed.success ||
      sender.id !== chrome.runtime.id ||
      sender.tab?.id !== this.state.tabId ||
      sender.frameId !== 0 ||
      !sender.url ||
      !this.state.page
    )
      return;
    try {
      const url = new URL(sender.url);
      if (url.origin + url.pathname !== this.state.page.url) return;
    } catch {
      return;
    }
    ++this.pickerVersion;
    if (this.state.pickerActive !== parsed.data.active)
      this.patch({ pickerActive: parsed.data.active });
  };
  private async readPickerState(tabId: number) {
    const version = ++this.pickerVersion;
    let active = false;
    try {
      const value: unknown = await chrome.tabs.sendMessage(
        tabId,
        { type: 'POINTDOM_GET_PICKER_STATE' },
        { frameId: 0 },
      );
      active = z.object({ active: z.boolean() }).parse(value).active;
    } catch {
      /* No injected picker is an idle page. */
    }
    if (
      version === this.pickerVersion &&
      tabId === this.state.tabId &&
      active !== this.state.pickerActive
    )
      this.patch({ pickerActive: active });
    return this.state.pickerActive;
  }
  private onTabUpdated = (tabId: number, info: chrome.tabs.OnUpdatedInfo) => {
    if (tabId === this.state.tabId && (info.url || info.status === 'complete')) this.onTab();
  };
  private onFocus = () => {
    void this.loadShortcuts();
    void this.syncSiteAccess();
    this.onTab();
  };
  private onVisibility = () => {
    if (!document.hidden) this.onFocus();
  };
  private async loadShortcuts() {
    try {
      const commands = await chrome.commands.getAll();
      this.patch({
        shortcuts: {
          pick: commands.find((c) => c.name === 'pick-element')?.shortcut || '',
          panel: commands.find((c) => c.name === '_execute_action')?.shortcut || '',
        },
      });
    } catch {
      /* Shortcuts may not be available in every Chromium build. */
    }
  }
  async start() {
    this.running = true;
    chrome.runtime.onMessage.addListener(this.onPickerState);
    chrome.storage.onChanged.addListener(this.onStorage);
    chrome.tabs.onActivated.addListener(this.onTab);
    chrome.tabs.onUpdated.addListener(this.onTabUpdated);
    chrome.permissions?.onAdded?.addListener(this.onPermissionsChanged);
    chrome.permissions?.onRemoved?.addListener(this.onPermissionsChanged);
    window.addEventListener('focus', this.onFocus);
    document.addEventListener('visibilitychange', this.onVisibility);
    try {
      const data = await chrome.storage.local.get([
        'bridgeToken',
        'pointdomPreferences',
        'pointdomConnectionNonce',
        'pointdomPreferredAgent',
      ]);
      // Persist one pending capability across panel/tab reopening. No page content is involved.
      this.nonce =
        typeof data.pointdomConnectionNonce === 'string' &&
        /^[a-f0-9]{64}$/.test(data.pointdomConnectionNonce)
          ? data.pointdomConnectionNonce
          : newConnectionNonce();
      await chrome.storage.local.set({ pointdomConnectionNonce: this.nonce });
      const platform = await chrome.runtime.getPlatformInfo?.().catch(() => null);
      this.patch({
        installPlatform: platform?.os === 'mac' || platform?.os === 'win' ? platform.os : null,
      });
      this.token = typeof data.bridgeToken === 'string' ? data.bridgeToken : '';
      this.preferredAgent =
        typeof data.pointdomPreferredAgent === 'string' ? data.pointdomPreferredAgent : '';
      this.patch({
        pairingSaved: Boolean(this.token.trim()),
        preferences: readPreferences(data.pointdomPreferences),
      });
      await Promise.all([this.syncTab(), this.loadShortcuts()]);
      if (this.token) await this.connect();
      else {
        this.patch({ settings: true });
        await this.discover();
      }
    } catch (error) {
      this.fail(error);
    } finally {
      this.patch({ ready: true });
      this.poll();
    }
  }
  stop() {
    this.running = false;
    ++this.accessVersion;
    clearTimeout(this.timer);
    chrome.runtime.onMessage.removeListener(this.onPickerState);
    chrome.storage.onChanged.removeListener(this.onStorage);
    chrome.tabs.onActivated.removeListener(this.onTab);
    chrome.tabs.onUpdated.removeListener(this.onTabUpdated);
    chrome.permissions?.onAdded?.removeListener(this.onPermissionsChanged);
    chrome.permissions?.onRemoved?.removeListener(this.onPermissionsChanged);
    window.removeEventListener('focus', this.onFocus);
    document.removeEventListener('visibilitychange', this.onVisibility);
  }
  private poll() {
    if (!this.running) return;
    this.timer = setTimeout(() => {
      void (document.hidden ? Promise.resolve() : this.refresh()).finally(() => this.poll());
    }, 2500);
  }
  async stopPicker(tabId = this.state.tabId) {
    if (tabId !== undefined)
      try {
        await chrome.tabs.sendMessage(tabId, { type: 'PAGEPATCH_STOP_PICKER' });
      } catch {
        /* Page can close before the request arrives. */
      }
    if (tabId === this.state.tabId) {
      ++this.pickerVersion;
      this.patch({ pickerActive: false });
    }
  }
  async pick() {
    try {
      await this.syncTab();
      if (this.state.tabId === undefined || !this.state.projectId)
        throw new Error(
          this.state.preferences.language === 'en'
            ? 'Open a project page first.'
            : '请先打开项目网页。',
        );
      const tabId = this.state.tabId;
      const pageUrl = this.state.page?.url;
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ['content.js'],
      });
      if (this.state.tabId !== tabId || this.state.page?.url !== pageUrl) return;
      const active = await this.readPickerState(tabId);
      this.notify(
        active ? '点击元素，Esc 结束。' : '选取已结束。',
        active ? 'Click elements; Esc to finish.' : 'Selection ended.',
      );
    } catch (error) {
      this.notify(
        `${error instanceof Error ? error.message : '选取失败'}。请在设置中启用当前网页访问。`,
        `${error instanceof Error ? error.message : 'Selection failed'}. Enable access to this page in Settings.`,
        true,
      );
    }
  }
  async locate(item: Selection) {
    await this.syncTab();
    const tabId = this.state.tabId;
    const projectId = this.state.projectId;
    if (
      tabId === undefined ||
      !projectId ||
      this.state.page?.url !== item.url ||
      !this.state.selections.some(
        (value) => value.selector === item.selector && value.url === item.url,
      )
    ) {
      this.notify('请打开对应的项目页面。', 'Open the matching project page.', true);
      return;
    }
    await chrome.scripting.executeScript({ target: { tabId }, files: ['locator.js'] });
    const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (
      this.state.projectId !== projectId ||
      active?.id !== tabId ||
      !active.url ||
      new URL(active.url).origin + new URL(active.url).pathname !== item.url
    )
      return;
    const result: unknown = await chrome.tabs.sendMessage(
      tabId,
      { type: 'POINTDOM_LOCATE_ELEMENT', selection: item },
      { frameId: 0 },
    );
    if (
      this.state.tabId !== tabId ||
      this.state.projectId !== projectId ||
      this.state.page?.url !== item.url
    )
      return;
    if (z.object({ ok: z.literal(true) }).safeParse(result).success)
      this.notify('已定位。', 'Element located.');
    else this.notify('元素已变化，请重新选取。', 'Element changed. Select it again.', true);
  }
  describe(selector: string, description: string) {
    this.retry = null;
    this.patch({
      selections: this.state.selections.map((s) =>
        s.selector === selector ? { ...s, description } : s,
      ),
    });
    if (this.state.tabId !== undefined)
      void chrome.runtime
        .sendMessage({
          type: 'PAGEPATCH_DESCRIBE_SELECTION',
          tabId: this.state.tabId,
          selector,
          description,
        })
        .catch(this.fail);
  }
  remove(selector: string) {
    this.retry = null;
    const selections = this.state.selections.filter((s) => s.selector !== selector);
    this.patch({ selections });
    if (this.state.tabId !== undefined)
      void chrome.storage.local
        .set({ [`selection:${this.state.tabId}`]: selections })
        .catch(this.fail);
  }
  async clearSelected() {
    const tabId = this.state.tabId;
    if (tabId === undefined || !this.state.selections.length) return;
    await this.stopPicker(tabId);
    const result: unknown = await chrome.runtime.sendMessage({
      type: 'POINTDOM_CLEAR_SELECTED',
      tabId,
    });
    if (!z.object({ ok: z.literal(true) }).safeParse(result).success)
      throw new Error(
        this.state.preferences.language === 'en'
          ? 'Could not clear selections. Try again.'
          : '清空选取失败，请重试。',
      );
    if (this.state.tabId !== tabId) return;
    this.retry = null;
    this.patch({ selections: [] });
    this.notify('已清空选取，整体要求已保留。', 'Selections cleared. Overall instructions kept.');
  }
  async openProjectSite(origin: string) {
    if (!linkedSites(this.state.projects).some((site) => site.id === origin))
      throw new Error(
        this.state.preferences.language === 'en'
          ? 'Choose a linked project URL.'
          : '请选择已关联的项目网址。',
      );
    await chrome.tabs.create({ url: origin });
  }
  async enablePage(selectedOrigin?: string, settingsPage = false) {
    const sites = linkedSites(this.state.projects);
    const origin = this.state.origin || selectedOrigin || (sites.length === 1 ? sites[0]!.id : '');
    const tabId = this.state.tabId;
    if (this.state.connection !== 'connected')
      throw new Error(
        this.state.preferences.language === 'en'
          ? 'Connect the local service first.'
          : '请先连接本地服务。',
      );
    if (!sites.some((site) => site.id === origin) || (!settingsPage && tabId === undefined))
      throw new Error(
        this.state.preferences.language === 'en'
          ? 'Choose a linked project URL, open it, then enable access.'
          : '请选择已关联的项目网址，打开后启用访问。',
      );
    if (this.state.enablingOrigin) return;
    this.patch({ enablingOrigin: origin });
    try {
      // Request only a locally linked origin, directly from the user's click. Before permission,
      // Chrome may omit Tab.url; that cannot be used as proof the project is unlinked.
      if (!(await chrome.permissions.request({ origins: [`${origin}/*`] })))
        throw new Error(
          this.state.preferences.language === 'en'
            ? 'Allow access to this page.'
            : '请允许访问当前网页。',
        );
      if (settingsPage) {
        // The settings tab itself is never an injection target.
        const tabs = await chrome.tabs.query({ url: `${origin}/*`, currentWindow: true });
        const projectTab = tabs.find((tab) => tab.url && new URL(tab.url).origin === origin);
        if (projectTab?.id !== undefined) await chrome.tabs.update(projectTab.id, { active: true });
        else await chrome.tabs.create({ url: origin });
        await chrome.runtime.sendMessage({ type: 'POINTDOM_SYNC_SITES' });
        this.notify(
          '项目网页访问已启用，点击扩展图标开始批注。',
          'Project access enabled. Click the extension icon to annotate.',
        );
        return;
      }
      if (tabId === undefined) throw new Error('请先打开项目网页。');
      const [granted] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (
        granted?.id !== tabId ||
        !granted?.url ||
        !/^https?:/.test(granted.url) ||
        new URL(granted.url).origin !== origin
      )
        throw new Error(
          this.state.preferences.language === 'en'
            ? 'The active page changed. Try again on the project page.'
            : '当前网页已变化，请返回项目网页后重试。',
        );
      await chrome.scripting.executeScript({ target: { tabId }, files: ['toolbar.js'] });
      await this.syncTab();
      this.notify(
        '网页访问已启用，可使用“选取元素”。',
        'Page access enabled. You can now select elements.',
      );
    } finally {
      await this.syncSiteAccess();
      this.patch({ enablingOrigin: '' });
    }
  }

  async submit() {
    const state = this.state;
    if (
      state.submitting ||
      state.connection !== 'connected' ||
      !state.projectId ||
      (!this.retry && !state.agents.some((agent) => agent.id === state.recipientId)) ||
      !(state.draft.trim() || state.selections.some((s) => s.description?.trim()))
    )
      return;
    const target = state.selections[0] || state.page;
    if (!target) {
      this.notify('请先打开项目网页。', 'Open your project page first.', true);
      return;
    }
    const data: Submission = this.retry || {
      executor: 'mcp',
      id: crypto.randomUUID(),
      projectId: state.projectId,
      recipientId: state.recipientId,
      instruction:
        state.draft.trim() ||
        (state.preferences.language === 'en'
          ? `Apply the individual descriptions to ${state.selections.filter((s) => s.description?.trim()).length} elements`
          : `按独立描述修改 ${state.selections.filter((s) => s.description?.trim()).length} 个元素`),
      selection: target,
      ...(state.selections.length ? { selections: state.selections.map((s) => ({ ...s })) } : {}),
    };
    this.retry = data;
    this.patch({ submitting: true });
    try {
      z.object({ job: jobSchema }).parse(await this.api('/api/jobs', data));
      this.retry = null;
      await this.stopPicker(state.tabId);
      if (state.tabId !== undefined)
        await chrome.runtime.sendMessage({
          type: 'PAGEPATCH_CLEAR_SELECTIONS',
          tabId: state.tabId,
        });
      if (this.state.tabId === state.tabId) this.patch({ selections: [], draft: '' });
      this.notify('已提交，等待 Agent 领取。', 'Submitted. Awaiting an agent claim.');
      await this.refresh();
    } catch (error) {
      this.notify(
        `提交未确认：${error instanceof Error ? error.message : '网络错误'}。直接重试将沿用同一任务 ID。`,
        `Submission unconfirmed: ${error instanceof Error ? error.message : 'network error'}. Retrying without changes uses the same task ID.`,
        true,
      );
    } finally {
      this.patch({ submitting: false });
    }
  }
  async restore(job: Job) {
    this.retry = null;
    this.patch({
      selections: job.selections || [job.selection],
      draft: '',
      projectId: job.projectId,
    });
    if (this.state.tabId !== undefined)
      await chrome.storage.local.set({
        [`selection:${this.state.tabId}`]: this.state.selections,
        [`draft:${this.state.tabId}`]: '',
      });
    this.notify('填写修改意见后提交。', 'Describe your next change, then submit.');
  }
  async reassign(job: Job, recipientId: string) {
    z.object({ job: jobSchema }).parse(
      await this.api(`/api/jobs/${job.id}/recipient`, {
        recipientId,
        expectedRecipientId: job.recipient?.id || null,
      }),
    );
    await this.refresh();
    this.notify(
      '已改派；等待所选客户端领取。',
      'Reassigned. Waiting for the selected client to claim.',
    );
  }
  async cancel(job: Job) {
    await this.api(`/api/jobs/${job.id}/cancel`, {});
    await this.refresh();
    if (job.executor === 'mcp')
      this.notify(
        '批注已取消；请在 Agent App 中停止正在执行的操作。',
        'Annotation cancelled. Stop any ongoing edits in your agent app.',
      );
  }
  async copyContext() {
    const target = this.state.selections[0] || this.state.page;
    if (!target) {
      this.notify('请先选取网页元素。', 'Select a page element first.', true);
      return;
    }
    await navigator.clipboard.writeText(
      JSON.stringify(
        agentContext({
          id: crypto.randomUUID(),
          projectId: this.state.projectId,
          instruction: this.state.draft.trim(),
          selection: target,
          selections: this.state.selections,
        }),
        null,
        2,
      ),
    );
    this.notify('已复制 DOM 与修改描述。', 'DOM context and change descriptions copied.');
  }
}
export const controller = new PanelController();
