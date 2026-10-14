import { agentContext } from '../shared/agent-context.js';
import {
  readSelections,
  executionSchema,
  type Execution,
  type ModelChoice,
  type Selection,
  type Project,
  type Job,
  type Reply,
  type Submission,
  terminal,
} from '../shared/contracts.js';
function element<T extends HTMLElement>(id: string) {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing ${id}`);
  return found as T;
}
const tokenInput = element<HTMLInputElement>('token'),
  instruction = element<HTMLTextAreaElement>('instruction'),
  projectSelect = element<HTMLSelectElement>('project'),
  submit = element<HTMLButtonElement>('submit');
const BASE = 'http://127.0.0.1:4318';
let token = '',
  projects: Project[] = [],
  selected: Selection | null = null,
  selectedElements: Selection[] = [],
  pageContext: Selection | null = null,
  tabId: number | undefined,
  connected = false,
  submitting = false;
let executor: 'codex' | 'opencode' | 'mcp' = 'opencode';
let hasSavedExecutor = false;
let explicitProjectOrigin = '',
  explicitProjectId = '';
const executorSelect = element<HTMLSelectElement>('executor');
executorSelect.addEventListener('change', () => {
  executor =
    executorSelect.value === 'mcp'
      ? 'mcp'
      : executorSelect.value === 'opencode'
        ? 'opencode'
        : 'codex';
  hasSavedExecutor = true;
  retrySubmission = null;
  renderExecution();
  void chrome.storage.local.set({ executor });
  if (connected) void connect();
});
let models: ModelChoice[] = [];
let execution: Execution = { approvalPolicy: 'on-request' };
const modelSelect = element<HTMLSelectElement>('model'),
  speedSelect = element<HTMLSelectElement>('speed'),
  effortSelect = element<HTMLSelectElement>('effort'),
  approvalSelect = element<HTMLSelectElement>('approval');
const effortNames: Record<string, string> = {
  none: '无',
  minimal: '最少',
  low: '低',
  medium: '中',
  high: '高',
  xhigh: '更高',
  max: '最高',
  ultra: 'Ultra',
};
function options(
  select: HTMLSelectElement,
  items: { id: string; name: string }[],
  fallback: string,
) {
  select.replaceChildren();
  const auto = node('option', fallback);
  auto.value = '';
  select.append(auto);
  for (const item of items) {
    const option = node('option', item.name);
    option.value = item.id;
    select.append(option);
  }
}
function renderExecution() {
  options(
    modelSelect,
    models.map((m) => ({ id: m.model, name: m.name })),
    '自动',
  );
  modelSelect.value = execution.model ?? '';
  const model =
    models.find((m) => m.model === execution.model) || models.find((m) => m.isDefault) || models[0];
  options(speedSelect, model?.tiers.map((t) => ({ id: t.id, name: t.name || t.id })) ?? [], '默认');
  options(
    effortSelect,
    model?.efforts.map((id) => ({ id, name: effortNames[id] || id })) ?? [],
    model?.defaultEffort
      ? `默认（${effortNames[model.defaultEffort] || model.defaultEffort}）`
      : '默认',
  );
  if (model && execution.effort && !model.efforts.includes(execution.effort))
    delete execution.effort;
  if (model && execution.serviceTier && !model.tiers.some((t) => t.id === execution.serviceTier))
    delete execution.serviceTier;
  speedSelect.value = execution.serviceTier ?? '';
  effortSelect.value = execution.effort ?? '';
  approvalSelect.value = execution.approvalPolicy;
  element<HTMLInputElement>('auto-commit').checked = execution.autoCommit === true;
  element('execution-summary').textContent = model?.name || '自动';
  executorSelect.value = executor;
  for (const control of [
    modelSelect,
    speedSelect,
    effortSelect,
    approvalSelect,
    element<HTMLInputElement>('auto-commit'),
  ]) {
    control.disabled = executor !== 'codex';
    control.closest('label')!.hidden = executor !== 'codex';
  }
  if (executor === 'opencode') {
    element('execution-summary').textContent = 'OpenCode CLI';
    element('execution-help').textContent =
      '使用本机 OpenCode 的模型配置，发送后直接执行。需要权限时在此确认。';
    return;
  }
  if (executor === 'mcp') {
    element('execution-summary').textContent = '其他 Agent';
    element('execution-help').textContent =
      '提交后由 Agent 通过 MCP 领取。模型、权限与提交由对应 App 管理。';
    return;
  }
  element('execution-help').textContent =
    execution.approvalPolicy === 'never'
      ? '不弹确认，超出权限则停止。'
      : execution.approvalPolicy === 'untrusted'
        ? '更多操作需要确认。'
        : '需要额外权限时确认。';
}
for (const select of [
  modelSelect,
  speedSelect,
  effortSelect,
  approvalSelect,
  element<HTMLInputElement>('auto-commit'),
])
  select.addEventListener('change', () => {
    execution = executionSchema.parse({
      ...(modelSelect.value ? { model: modelSelect.value } : {}),
      ...(speedSelect.value ? { serviceTier: speedSelect.value } : {}),
      ...(effortSelect.value ? { effort: effortSelect.value } : {}),
      approvalPolicy: approvalSelect.value,
      ...(element<HTMLInputElement>('auto-commit').checked ? { autoCommit: true } : {}),
    });
    renderExecution();
    retrySubmission = null;
    void chrome.storage.local.set({ executionSettings: execution });
  });
document.addEventListener('pointerdown', (event) => {
  const settings = element<HTMLDetailsElement>('execution-settings');
  if (event.target instanceof Node && !settings.contains(event.target)) settings.open = false;
});
async function stopPicker(targetTab = tabId) {
  if (targetTab === undefined) return;
  try {
    await chrome.tabs.sendMessage(targetTab, { type: 'PAGEPATCH_STOP_PICKER' });
  } catch {
    /* No content script on this page, or it was closed/navigated away. */
  }
}
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape' || event.isComposing) return;
  element<HTMLDetailsElement>('execution-settings').open = false;
  void stopPicker().then(() => notice('已退出选取，可继续填写修改意见。'));
});
let jobFilter: 'all' | 'active' = 'all';
let cachedJobs: Job[] = [];
function renderJobs() {
  const jobs = cachedJobs.filter((job) => jobFilter === 'all' || !terminal(job.status));
  element('jobs').replaceChildren(...jobs.map(renderJob));
  if (!jobs.length)
    element('jobs').append(
      node(
        'p',
        jobFilter === 'all' ? '选取网页元素，写下你的修改意见。' : '暂无进行中的修改',
        'empty',
      ),
    );
  element('job-count').textContent = String(cachedJobs.length);
  element('tab-active').classList.toggle(
    'has-active-jobs',
    cachedJobs.some((job) => !terminal(job.status)),
  );
  element('active-count').textContent = String(
    cachedJobs.filter((job) => !terminal(job.status)).length,
  );
}
for (const filter of ['all', 'active'] as const)
  element(`tab-${filter}`).addEventListener('click', () => {
    jobFilter = filter;
    for (const name of ['all', 'active'])
      element(`tab-${name}`).setAttribute('aria-pressed', String(name === filter));
    renderJobs();
  });
async function refreshShortcuts() {
  try {
    const commands = await chrome.commands.getAll();
    for (const [id, name] of [
      ['shortcut-pick', 'pick-element'],
      ['shortcut-panel', '_execute_action'],
    ] as const) {
      element(id).textContent =
        commands.find((command) => command.name === name)?.shortcut || '未设置';
    }
  } catch {
    element('shortcut-pick').textContent = '暂时无法读取';
    element('shortcut-panel').textContent = '暂时无法读取';
  }
}
element('edit-shortcuts').addEventListener('click', () => {
  void chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
});
window.addEventListener('focus', () => {
  void refreshShortcuts();
});
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) void refreshShortcuts();
});
void refreshShortcuts();
element('connection-settings').addEventListener('click', () => {
  void refreshShortcuts();
  element('connection-view').hidden = false;
});
element('close-connection').addEventListener('click', () => {
  element('connection-view').hidden = true;
  element('connection-settings').focus();
});
let currentOrigin = '';
let lastJobs = '';
let retrySubmission: Submission | null = null;
function node<K extends keyof HTMLElementTagNameMap>(tag: K, text = '', className = '') {
  const n = document.createElement(tag);
  n.textContent = text;
  n.className = className;
  return n;
}
function notice(message: string, error = false) {
  const n = element('notice');
  n.textContent = message;
  n.className = error ? 'error' : '';
}
async function api<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(BASE + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-PagePatch-Client': chrome.runtime.id,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(['/api/status', '/api/models'].includes(path) ? 70000 : 10000),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || '请求失败');
  return result as T;
}
function updateSubmit() {
  submit.disabled =
    !(instruction.value.trim() || selectedElements.some((item) => item.description?.trim())) ||
    submitting;
}
function setSelections(items: Selection[]) {
  selectedElements = items;
  selected = items[0] || null;
}
function renderSelection() {
  const container = element('selected');
  container.replaceChildren();
  container
    .closest('.compose-box')
    ?.classList.toggle('has-selections', selectedElements.length > 0);
  instruction.placeholder = selectedElements.length ? '整体要求（可选）…' : '描述想修改的地方…';
  if (!selected) {
    container.className = 'target empty';
    container.textContent = '点击“选取元素”，然后点击网页上要修改的位置。';
  } else {
    container.className = 'target';
    for (const item of selectedElements) {
      const row = node('div', '', 'selected-row');
      const title = node('strong', item.label || item.tag);
      const remove = node('button', '×', 'quiet');
      remove.setAttribute('aria-label', `移除 ${item.label || item.tag}`);
      remove.addEventListener('click', () => {
        setSelections(selectedElements.filter((value) => value !== item));
        retrySubmission = null;
        if (tabId) void chrome.storage.local.set({ [`selection:${tabId}`]: selectedElements });
        renderSelection();
      });
      row.append(title, remove);
      const details = node('details');
      details.append(
        node('summary', '元素与样式'),
        node('code', item.selector),
        node('pre', JSON.stringify(item.styles, null, 2)),
      );
      const description = node('textarea');
      description.className = 'element-description';
      description.setAttribute('aria-label', `${item.label || item.tag}的修改描述`);
      description.placeholder = '这个元素怎么改…';
      description.maxLength = 2000;
      description.rows = 2;
      description.value = item.description || '';
      description.addEventListener('input', () => {
        item.description = description.value;
        retrySubmission = null;
        updateSubmit();
        if (tabId)
          void chrome.runtime.sendMessage({
            type: 'PAGEPATCH_DESCRIBE_SELECTION',
            tabId,
            selector: item.selector,
            description: description.value,
          });
      });
      const entry = node('div', '', 'selected-entry');
      entry.append(row, details, description);
      container.append(entry);
    }
  }
  renderProjects();
  updateSubmit();
}
function renderProjects() {
  const origin = selected ? new URL(selected.url).origin : currentOrigin;
  const matches = origin ? projects.filter((p) => p.origins.includes(origin)) : projects;
  projectSelect.replaceChildren(
    node(
      'option',
      matches.length ? '选择项目' : connected ? '此网址没有匹配的代码项目' : '连接后自动匹配',
    ),
  );
  projectSelect.options[0]!.value = '';
  for (const p of matches) {
    const o = node('option', p.name);
    o.value = p.id;
    projectSelect.append(o);
  }
  projectSelect.value =
    matches.length === 1
      ? matches[0]!.id
      : explicitProjectOrigin === origin && matches.some((p) => p.id === explicitProjectId)
        ? explicitProjectId
        : '';
  element('project-field').hidden = matches.length === 1;
  if (connected && matches.length > 1 && !projectSelect.value)
    element('connection-view').hidden = false;
  element('project-path').textContent =
    matches.length === 1 ? `修改项目：${matches[0]!.name}` : '项目决定修改哪个本地代码目录';
}
async function connect() {
  token = tokenInput.value.trim();
  if (!token) {
    notice('请先填写本机配对码', true);
    return;
  }
  element('connection').textContent = '连接中';
  try {
    const paired = await api<{ defaultExecutor?: 'codex' | 'opencode' }>('/api/pair', {});
    if (!hasSavedExecutor && paired.defaultExecutor) {
      executor = paired.defaultExecutor;
      renderExecution();
    }
    await chrome.storage.local.set({ bridgeToken: token });
    projects = (await api<{ projects: Project[] }>('/api/projects')).projects;
    connected = true;
    element('connection').textContent = '已连接';
    element<HTMLDetailsElement>('setup').open = false;
    element('connection-view').hidden = true;
    renderProjects();
    updateSubmit();
    await refresh();
    if (executor !== 'codex') {
      element('account').textContent =
        executor === 'opencode' ? 'OpenCode CLI 直接执行' : '由其他 Agent 领取';
      return;
    }
    try {
      models = (await api<{ models: ModelChoice[] }>('/api/models')).models;
      renderExecution();
    } catch (e) {
      notice(e instanceof Error ? e.message : '模型列表加载失败', true);
    }
    const state = await api<{ codex: boolean; authenticated?: boolean; error?: string }>(
      '/api/status',
    );
    element('account').textContent = state.codex
      ? state.authenticated
        ? 'Codex 已就绪'
        : '请先在本机执行 codex login'
      : state.error || '请安装 Codex CLI';
    if (!state.codex || !state.authenticated) {
      element<HTMLDetailsElement>('setup').open = true;
      element('connection-view').hidden = false;
      notice(element('account').textContent || '', true);
    }
  } catch (e) {
    connected = false;
    element('connection').textContent = '未连接';
    element('connection-view').hidden = false;
    updateSubmit();
    notice(`连接失败：${e instanceof Error ? e.message : '请检查本地服务是否启动'}`, true);
  }
}
async function syncTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentOrigin = tab?.url && /^https?:/.test(tab.url) ? new URL(tab.url).origin : '';
  pageContext =
    currentOrigin && tab?.url
      ? {
          url: new URL(tab.url).origin + new URL(tab.url).pathname,
          title: (tab.title || '').slice(0, 300),
          label: '页面修改',
          selector: 'html',
          tag: 'html',
          viewport: {
            width: Math.min(20000, tab.width || 1),
            height: Math.min(20000, tab.height || 1),
          },
          rect: { x: 0, y: 0, width: 0, height: 0 },
          styles: {},
        }
      : null;
  if (tabId === tab?.id) {
    renderProjects();
    return;
  }
  tabId = tab?.id;
  retrySubmission = null;
  if (!tabId) {
    setSelections([]);
    renderSelection();
    return;
  }
  const data = await chrome.storage.local.get([`selection:${tabId}`, `draft:${tabId}`]);
  setSelections(readSelections(data[`selection:${tabId}`]));
  const draft = data[`draft:${tabId}`];
  instruction.value = typeof draft === 'string' ? draft : '';
  renderSelection();
}
element('enable-page').addEventListener('click', async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error('请先打开目标网页');
    const knownOrigin = tab.url && /^https?:/.test(tab.url) ? new URL(tab.url).origin : '';
    const project = knownOrigin
      ? projects.find((p) => p.origins.includes(knownOrigin))
      : projects.find((p) => p.id === projectSelect.value);
    if (!project) throw new Error('没有匹配的代码项目，请先连接本地服务');
    const origins = knownOrigin ? [knownOrigin] : project.origins;
    if (!(await chrome.permissions.request({ origins: origins.map((origin) => `${origin}/*`) })))
      throw new Error('请允许访问目标网站');
    const [grantedTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!grantedTab?.url || !/^https?:/.test(grantedTab.url))
      throw new Error('请打开已绑定的网页，再启用批注');
    const url = new URL(grantedTab.url);
    if (!project.origins.includes(url.origin)) throw new Error('当前网页不属于所选项目');
    currentOrigin = url.origin;
    renderProjects();
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['toolbar.js'] });
    element('enable-page').textContent = '网页访问已启用';
    notice('已启用，请使用快捷键或侧栏的“选取”。');
  } catch (error) {
    notice(error instanceof Error ? error.message : '启用失败', true);
  }
});
element('connect').addEventListener('click', () => {
  void connect();
});
element('pick').addEventListener('click', async () => {
  try {
    await syncTab();
    if (!tabId) throw new Error('没有可选取的网页');
    await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
    notice('请点击网页元素，Esc 退出选取。');
  } catch (error) {
    notice(
      `${error instanceof Error ? error.message : '选取失败'}。请先点击“启用当前网页访问”。` +
        '请先在目标网页点击浏览器工具栏的 PagePatch 图标。浏览器设置页和商店页面不支持选取。',
      true,
    );
  }
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !tabId) return;
  const value = changes[`selection:${tabId}`];
  if (!value) return;
  const incoming = readSelections(value.newValue);
  if (
    document.activeElement?.classList.contains('element-description') &&
    JSON.stringify(incoming.map((item) => [item.url, item.selector])) ===
      JSON.stringify(selectedElements.map((item) => [item.url, item.selector]))
  )
    return;
  if (JSON.stringify(incoming) === JSON.stringify(selectedElements)) return;
  setSelections(incoming);
  retrySubmission = null;
  renderSelection();
  notice(
    selectedElements.length
      ? `已选 ${selectedElements.length} 个元素，可继续点选；Esc 结束。`
      : '已清空选取。',
  );
});
chrome.tabs.onActivated.addListener(() => {
  void syncTab();
});
projectSelect.addEventListener('change', () => {
  explicitProjectOrigin = selected ? new URL(selected.url).origin : currentOrigin;
  explicitProjectId = projectSelect.value;
  retrySubmission = null;
  element('project-path').textContent =
    projects.find((p) => p.id === projectSelect.value)?.cwd || '';
  updateSubmit();
});
instruction.addEventListener('input', () => {
  retrySubmission = null;
  updateSubmit();
  if (tabId) void chrome.storage.local.set({ [`draft:${tabId}`]: instruction.value });
});
let composing = false;
document.querySelector('.compose-box')!.addEventListener('compositionstart', () => {
  composing = true;
});
document.querySelector('.compose-box')!.addEventListener('compositionend', () => {
  composing = false;
});
document.querySelector<HTMLElement>('.compose-box')!.addEventListener('keydown', (event) => {
  if (!(event.target instanceof HTMLTextAreaElement)) return;
  if (
    event.key !== 'Enter' ||
    event.shiftKey ||
    event.ctrlKey ||
    event.metaKey ||
    event.altKey ||
    event.isComposing ||
    composing ||
    event.keyCode === 229
  )
    return;
  event.preventDefault();
  if (!event.repeat && !submit.disabled) submit.click();
});
submit.addEventListener('click', async () => {
  if (
    !(instruction.value.trim() || selectedElements.some((item) => item.description?.trim())) ||
    submitting
  )
    return;
  if (!connected) {
    notice('请先在设置中连接本地服务。', true);
    return;
  }
  if (!projectSelect.value) {
    notice('请先在设置中绑定当前网页的代码项目。', true);
    return;
  }
  const target = selected || pageContext;
  if (!target) {
    notice('请先打开目标网页，再发送修改要求。', true);
    return;
  }
  const data: Submission = retrySubmission || {
    executor,
    id: crypto.randomUUID(),
    projectId: projectSelect.value,
    instruction:
      instruction.value.trim() ||
      `按独立描述修改 ${selectedElements.filter((item) => item.description?.trim()).length} 个元素`,
    selection: target,
    ...(selectedElements.length
      ? { selections: selectedElements.map((item) => ({ ...item })) }
      : {}),
    ...(executor === 'codex' ? { execution: { ...execution } } : {}),
  };
  const submittedTab = tabId;
  retrySubmission = data;
  submitting = true;
  updateSubmit();
  try {
    await api('/api/jobs', data);
    retrySubmission = null;
    await stopPicker(submittedTab);
    if (submittedTab !== undefined)
      await chrome.runtime.sendMessage({ type: 'PAGEPATCH_CLEAR_SELECTIONS', tabId: submittedTab });
    if (tabId === submittedTab) {
      instruction.value = '';
      setSelections([]);
      renderSelection();
    }
    notice(
      data.executor === 'mcp'
        ? '已发布批注。请在 Agent App 中让它读取 PagePatch 待处理任务。'
        : '已提交，Codex 会在本地项目中执行。你可以继续选择其他元素。',
    );
    await refresh();
  } catch (e) {
    notice(
      `提交未确认：${e instanceof Error ? e.message : '网络错误'}。未修改意见时再次点击会使用相同任务 ID，避免重复执行。`,
      true,
    );
  } finally {
    submitting = false;
    updateSubmit();
  }
});
const labels: Record<string, string> = {
  queued: '排队中',
  running: '修改中',
  waiting: '需要确认',
  completed: '已完成',
  failed: '失败',
  cancelled: '已停止',
  interrupted: '已中断',
};
function action(text: string, run: () => Promise<void>, className = '') {
  const button = node('button', text, className);
  button.addEventListener('click', () => {
    button.disabled = true;
    void run()
      .catch((e) => notice(e instanceof Error ? e.message : '操作失败', true))
      .finally(() => {
        button.disabled = false;
      });
  });
  return button;
}
function renderJob(job: Job) {
  const card = node('article', '', 'job');
  const head = node('div', '', 'job-head');
  head.append(
    node(
      'strong',
      (job.selection.label || job.selection.tag) +
        ((job.selections?.length || 0) > 1 ? ` 等 ${job.selections!.length} 个元素` : ''),
    ),
    node(
      'span',
      job.executor === 'mcp'
        ? (
            { queued: '待领取', running: 'Agent 处理中', completed: 'Agent 已回报' } as Record<
              string,
              string
            >
          )[job.status] || labels[job.status]
        : labels[job.status] || job.status,
      `pill status-${job.status}`,
    ),
  );
  card.append(
    head,
    node('p', job.instruction),
    node(
      'small',
      `${projects.find((p) => p.id === job.projectId)?.name || '项目'} · ${new Date(job.createdAt).toLocaleString()}`,
    ),
  );
  const described = job.selections?.filter((item) => item.description?.trim()) || [];
  if (described.length) {
    const notes = node('details');
    notes.append(node('summary', `元素描述 · ${described.length}`));
    for (const item of described)
      notes.append(node('strong', item.label || item.tag), node('p', item.description || ''));
    card.append(notes);
  }
  if (job.executor === 'mcp')
    card.append(
      node('small', 'MCP · ' + (job.agent || '等待 Agent 领取') + ' · 结果由外部 Agent 回报'),
    );
  if (job.error) card.append(node('p', job.error, 'error'));
  if (job.approval) {
    const approval = job.approval,
      box = node('div', '', 'approval');
    box.append(node('strong', approval.title), node('pre', approval.details));
    const send = async (reply: Reply) => {
      await api(`/api/jobs/${job.id}/approvals/${approval.id}`, reply);
      await refresh();
    };
    if (approval.kind === 'questions') {
      const inputs = new Map<string, HTMLTextAreaElement>();
      for (const q of approval.questions ?? []) {
        const label = node('label', q.question);
        const input = node('textarea');
        input.id = `question-${q.id}`;
        label.htmlFor = input.id;
        input.rows = 2;
        inputs.set(q.id, input);
        box.append(label);
        if (q.options.length) box.append(node('small', q.options.join(' / ')));
        box.append(input);
      }
      box.append(
        action(
          '提交回答',
          () =>
            send({
              answers: Object.fromEntries([...inputs].map(([id, input]) => [id, input.value])),
            }),
          'primary',
        ),
      );
    } else {
      const buttons = node('div', '', 'actions');
      buttons.append(
        action('允许本次', () => send({ decision: 'accept' }), 'primary'),
        action('拒绝', () => send({ decision: 'decline' })),
      );
      box.append(buttons);
    }
    card.append(box);
  }
  if (job.events.length) {
    const details = node('details');
    details.append(
      node('summary', `执行记录 · ${job.events.length}`),
      node(
        'pre',
        job.events.map((e) => `${new Date(e.at).toLocaleTimeString()}  ${e.text}`).join('\n'),
      ),
    );
    card.append(details);
  }
  if (job.result) {
    const details = node('details');
    details.append(node('summary', '修改结果'), node('pre', job.result));
    card.append(details);
  }
  if (terminal(job.status))
    card.append(
      action('继续修改', async () => {
        executor =
          job.executor === 'mcp' ? 'mcp' : job.executor === 'opencode' ? 'opencode' : 'codex';
        hasSavedExecutor = true;
        renderExecution();
        void chrome.storage.local.set({ executor });
        setSelections(job.selections || [job.selection]);
        if (tabId) await chrome.storage.local.set({ [`selection:${tabId}`]: selectedElements });
        renderSelection();
        projectSelect.value = job.projectId;
        instruction.value = '';
        retrySubmission = null;
        updateSubmit();
        instruction.focus();
        notice('填写新的修改意见，再点击“提交修改”。');
      }),
    );
  if (job.status === 'completed' && job.executor !== 'mcp') {
    if (job.commit?.status === 'committed') {
      card.append(node('small', `已 Commit · ${job.commit.hash?.slice(0, 8) || ''}`));
      card.append(node('small', job.commit.message?.split('\n')[0] || ''));
    } else {
      const button = action('Commit', async () => {
        await api(`/api/jobs/${job.id}/commit`, {});
        await refresh();
      });
      button.disabled = !['ready', 'failed'].includes(job.commit?.status || '');
      card.append(button);
      if (job.commit?.error) card.append(node('small', job.commit.error));
      else if (!job.commit) card.append(node('small', '旧任务未记录改动范围，请在项目中提交。'));
    }
  }
  if (!terminal(job.status))
    card.append(
      action(
        job.executor === 'mcp' ? '取消批注' : '停止任务',
        async () => {
          await api(`/api/jobs/${job.id}/cancel`, {});
          await refresh();
          if (job.executor === 'mcp') notice('批注已取消；请在 Agent App 中停止正在执行的操作。');
        },
        'quiet',
      ),
    );
  return card;
}
async function refresh() {
  if (!connected) {
    if (tokenInput.value.trim()) await connect();
    return;
  }
  try {
    const registered = (await api<{ projects: Project[] }>('/api/projects')).projects;
    if (JSON.stringify(registered) !== JSON.stringify(projects)) {
      projects = registered;
      renderProjects();
      updateSubmit();
    }
    const data = await api<{ jobs: Job[] }>('/api/jobs');
    const fingerprint = JSON.stringify(data.jobs);
    if (fingerprint !== lastJobs) {
      lastJobs = fingerprint;
      cachedJobs = data.jobs;
      renderJobs();
    }
    element('connection').textContent = '已连接';
  } catch (e) {
    connected = false;
    updateSubmit();
    element('connection').textContent = '服务离线';
    notice(e instanceof Error ? e.message : '本地服务连接中断', true);
  }
}
element('refresh').addEventListener('click', () => {
  void refresh();
});
async function poll() {
  if (!document.hidden) await refresh();
  setTimeout(() => {
    void poll();
  }, 2500);
}
void (async () => {
  await syncTab();
  const data = await chrome.storage.local.get(['bridgeToken', 'executionSettings', 'executor']);
  hasSavedExecutor =
    typeof data.executor === 'string' && ['codex', 'opencode', 'mcp'].includes(data.executor);
  executor = data.executor === 'mcp' ? 'mcp' : data.executor === 'codex' ? 'codex' : 'opencode';
  const saved = executionSchema.safeParse(data.executionSettings);
  if (saved.success) execution = saved.data;
  renderExecution();
  tokenInput.value = typeof data.bridgeToken === 'string' ? data.bridgeToken : '';
  if (tokenInput.value) await connect();
  else element('connection-view').hidden = false;
  void poll();
})();

element('copy-context').addEventListener('click', () => {
  const target = selected || pageContext;
  if (!target) {
    notice('请先选取网页元素。', true);
    return;
  }
  const context = agentContext({
    id: crypto.randomUUID(),
    projectId: projectSelect.value,
    instruction: instruction.value.trim(),
    selection: target,
    selections: selectedElements,
  });
  void navigator.clipboard.writeText(JSON.stringify(context, null, 2)).then(
    () => notice('已复制 DOM 与修改描述，可粘贴到其他 Agent。'),
    () => notice('复制失败，请允许扩展访问剪贴板后重试。', true),
  );
});
