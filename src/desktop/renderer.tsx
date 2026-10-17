import { Dropdown } from '@heroui/react/dropdown';
import { Switch } from '@heroui/react/switch';
import { Tabs } from '@heroui/react/tabs';
import { Toast, ToastQueue } from '@heroui/react/toast';
import { ToggleButton } from '@heroui/react/toggle-button';
import { ToggleButtonGroup } from '@heroui/react/toggle-button-group';
import { UiIcon } from '../shared/ui-icon.js';
import { wakeupInstruction } from '../shared/mcp-watch.js';
import { taskTitle, taskDescription } from '../shared/task-title.js';
import { taskMessage, cancellationMessage } from '../shared/task-message.js';
import type { QueuedToast, Selection } from 'react-aria-components';
import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { createRoot } from 'react-dom/client';
import { listen } from '@tauri-apps/api/event';
import { Button } from '@heroui/react/button';
import { Card } from '@heroui/react/card';
import { Input } from '@heroui/react/input';
import { Label } from '@heroui/react/label';
import { TextField } from '@heroui/react/textfield';
import { native, type Snapshot } from './native-api.js';
import { terminal, type Job } from '../shared/contracts.js';
import { formatTaskDuration } from '../extension/task-duration.js';

type ThemeMode = 'light' | 'dark' | 'system';
type Screen = 'tasks' | 'projects' | 'clients' | 'settings' | 'about';
const tray = new URLSearchParams(location.search).get('view') === 'tray';
document.documentElement.dataset.view = tray ? 'tray' : 'main';
document.addEventListener('contextmenu', (event) => {
  if (
    !(event.target instanceof Element) ||
    !event.target.closest('input, textarea, [contenteditable="true"]')
  )
    event.preventDefault();
});
const languages = [
  { id: 'en', label: 'English' },
  { id: 'zh-CN', label: '简体中文' },
] as const;
const initialLanguage = localStorage.getItem('pointdom-language') === 'en' ? 'en' : 'zh-CN';
function Desktop() {
  const reduceMotion = useReducedMotion();
  const [language, setLanguage] = useState(initialLanguage);
  const t = (zh: string, en: string) => (language === 'en' ? en : zh);
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem('pointdom-theme');
    return saved === 'light' || saved === 'system' ? saved : 'dark';
  });
  const [state, setState] = useState<Snapshot>();
  const [screen, updateScreen] = useState<Screen>('tasks');
  const [notices] = useState(() => new ToastQueue<{ message: string }>({ maxVisibleToasts: 1 }));
  const notify = useCallback(
    (message: string) => {
      notices.clear();
      if (message) notices.add({ message }, { timeout: 4000 });
    },
    [notices],
  );
  const setScreen = useCallback(
    (next: Screen) => {
      notices.clear();
      updateScreen(next);
    },
    [notices],
  );
  useEffect(() => () => notices.destroy(), [notices]);
  const [project, setProject] = useState('');
  const [selected, setSelected] = useState('');
  const [filter, setFilter] = useState<'all' | 'active'>('all');
  const [folder, setFolder] = useState('');
  const [manualSetup, setManualSetup] = useState(false);
  useEffect(() => {
    if (screen === 'settings' && manualSetup) {
      document.getElementById('manual-project-form')?.scrollIntoView({ block: 'nearest' });
    }
  }, [screen, manualSetup]);
  const [setupCopy, setSetupCopy] = useState<{ id: string; text: string }>();
  const [copiedProject, setCopiedProject] = useState('');
  useEffect(() => {
    if (!copiedProject) return;
    const timer = setTimeout(() => setCopiedProject(''), 2000);
    return () => clearTimeout(timer);
  }, [copiedProject]);
  const [name, setName] = useState('');
  const [origin, setOrigin] = useState('');
  const [config, setConfig] = useState('');
  const [busy, setBusy] = useState(false);
  const [reconnectPhase, setReconnectPhase] = useState<'idle' | 'pending' | 'failed'>('idle');
  const [error, setError] = useState('');
  const applySnapshot = useCallback((snapshot: Snapshot) => {
    setState(snapshot);
    if (snapshot.appSettings.language) setLanguage(snapshot.appSettings.language);
  }, []);
  const refresh = useCallback(async () => applySnapshot(await native.snapshot()), [applySnapshot]);
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      try {
        let snapshot = await native.snapshot();
        if (active && !tray && !snapshot.appSettings.language) {
          await native.setLanguage(initialLanguage);
          snapshot = await native.snapshot();
        }
        if (active) applySnapshot(snapshot);
      } catch {
        if (active) setError('STATE_UNAVAILABLE');
      } finally {
        if (active) timer = setTimeout(() => void load(), tray ? 1200 : 1800);
      }
    };
    void load();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [applySnapshot]);
  useEffect(() => {
    let active = true;
    let dispose: (() => void) | undefined;
    void listen<string>('language-changed', ({ payload }) => {
      if (payload === 'en' || payload === 'zh-CN') setLanguage(payload);
    })
      .then((unlisten) => {
        if (active) dispose = unlisten;
        else unlisten();
      })
      .catch(() => {});
    return () => {
      active = false;
      dispose?.();
    };
  }, []);
  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)');
    const update = () => {
      const theme = themeMode === 'system' ? (media.matches ? 'dark' : 'light') : themeMode;
      document.documentElement.dataset.theme = theme;
      document.documentElement.classList.toggle('dark', theme === 'dark');
    };
    update();
    localStorage.setItem('pointdom-theme', themeMode);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [themeMode]);
  useEffect(() => {
    document.documentElement.lang = language;
    localStorage.setItem('pointdom-language', language);
  }, [language]);
  useEffect(() => {
    if (tray) return;
    let active = true;
    let dispose: (() => void) | undefined;
    void listen('project-bound', () => {
      setScreen('projects');
      notify(
        t(
          '项目已绑定，返回网页允许访问即可。',
          'Project bound. Return to the page and allow access.',
        ),
      );
      void refresh();
    })
      .then((unlisten) => {
        if (active) dispose = unlisten;
        else unlisten();
      })
      .catch(() => {});
    return () => {
      active = false;
      dispose?.();
    };
  }, [language, refresh, notify, setScreen]);
  useEffect(() => {
    if (tray) return;
    let active = true;
    let dispose: (() => void) | undefined;
    void listen<string>('open-screen', ({ payload }) => {
      if (
        payload === 'tasks' ||
        payload === 'projects' ||
        payload === 'clients' ||
        payload === 'settings' ||
        payload === 'about'
      )
        setScreen(payload);
    })
      .then((unlisten) => {
        if (active) dispose = unlisten;
        else unlisten();
      })
      .catch(() => {});
    return () => {
      active = false;
      dispose?.();
    };
  }, [setScreen]);
  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => void native.motion(media.matches).catch(() => {});
    update();
    media.addEventListener('change', update);
    let dispose: (() => void) | undefined;
    let active = true;
    void listen<string>('open-task', ({ payload }) => {
      setSelected(payload);
      setScreen('tasks');
      setProject('');
    })
      .then((unlisten) => {
        if (active) dispose = unlisten;
        else unlisten();
      })
      .catch(() => {});
    return () => {
      active = false;
      dispose?.();
      media.removeEventListener('change', update);
    };
  }, []);
  useLayoutEffect(() => {
    if (tray) return;
    const toolbar = document.querySelector<HTMLElement>('.app-toolbar');
    const footer = document.querySelector<HTMLElement>('.app-footer');
    const workspace = document.querySelector<HTMLElement>('.workspace');
    if (!toolbar || !footer || !workspace) return;
    let content: HTMLElement | null = null;
    let frame = 0;
    let previousHeight = 0;
    const measure = () => {
      if (!content?.isConnected || !content.offsetHeight) return;
      const spacing = getComputedStyle(workspace);
      const notices = [...workspace.children].filter((element) =>
        element.classList.contains('notice'),
      );
      const taskList = content.querySelector<HTMLElement>('.task-list');
      // Expansion belongs to the list, not the native window's preferred height.
      const rows = taskList?.querySelectorAll<HTMLElement>('.task-entry > .task-card');
      const listHeight = taskList?.getBoundingClientRect().height || 0;
      const chromeHeight =
        content.getBoundingClientRect().height -
        listHeight +
        toolbar.offsetHeight +
        footer.offsetHeight +
        parseFloat(spacing.paddingTop) +
        parseFloat(spacing.paddingBottom) +
        notices.reduce((total, element) => total + element.getBoundingClientRect().height + 12, 0);
      let preferredListHeight = listHeight;
      if (taskList && rows?.length) {
        const listStyle = getComputedStyle(taskList);
        const visibleRows = [...rows].slice(0, 5);
        preferredListHeight =
          visibleRows.reduce((sum, row) => sum + row.getBoundingClientRect().height, 0) +
          parseFloat(listStyle.rowGap) * (visibleRows.length - 1) +
          parseFloat(listStyle.paddingTop) +
          parseFloat(listStyle.paddingBottom);
        taskList.style.setProperty('--task-list-height', `${preferredListHeight}px`);
      } else {
        taskList?.style.removeProperty('--task-list-height');
      }
      taskList?.style.setProperty('--task-list-chrome-height', `${chromeHeight}px`);
      const height = Math.ceil(chromeHeight + preferredListHeight);
      if (height !== previousHeight) {
        previousHeight = height;
        void native.fitWindow(height).catch(() => {});
      }
    };
    const fit = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    const observer = new ResizeObserver(fit);
    observer.observe(toolbar);
    observer.observe(footer);
    const bindContent = () => {
      const next = workspace.querySelector<HTMLElement>(
        `.app-panel[data-screen="${screen}"] > .panel-content`,
      );
      if (next !== content) {
        if (content) observer.unobserve(content);
        content = next;
        if (content) observer.observe(content);
      }
      // Filter mutations must be measured before paint, not on the next frame.
      cancelAnimationFrame(frame);
      measure();
    };
    // HeroUI mounts the selected panel after its selection context updates.
    const panels = new MutationObserver(bindContent);
    panels.observe(workspace, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['hidden'],
    });
    bindContent();
    return () => {
      panels.disconnect();
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [screen, language, error, state?.jobs.length, state?.error]);
  const run = async (action: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    setReconnectPhase('idle');
    setError('');
    notices.clear();
    try {
      await action();
      await refresh();
    } catch (cause) {
      setError(
        typeof cause === 'string' ? cause : t('操作失败，请重试。', 'Action failed. Please retry.'),
      );
    } finally {
      setBusy(false);
    }
  };
  const reconnect = async () => {
    if (busy) return;
    setBusy(true);
    setReconnectPhase('pending');
    setError('');
    notices.clear();
    try {
      await native.retry();
      const snapshot = await native.snapshot();
      setState(snapshot);
      if (!snapshot.connected) {
        setReconnectPhase('failed');
        setError('SERVICE_OFFLINE');
        return;
      }
      setReconnectPhase('idle');
      notify(t('已重新连接', 'Reconnected'));
    } catch (cause) {
      setReconnectPhase('failed');
      setError(typeof cause === 'string' ? cause : 'RECONNECT_FAILED');
    } finally {
      setBusy(false);
    }
  };
  const serviceProblem = error || state?.error || '';
  const servicePort = state?.servicePort ?? 4318;
  const serviceMessage =
    reconnectPhase === 'pending'
      ? t('正在重新连接…', 'Reconnecting…')
      : serviceProblem.startsWith('PORT_IN_USE')
        ? reconnectPhase === 'failed'
          ? t(
              `重连失败：端口 ${servicePort} 仍被占用。请先退出旧版 PointDOM 或占用端口的程序，再重试。`,
              `Reconnect failed: port ${servicePort} is still in use. Quit the previous PointDOM service or the app using this port, then retry.`,
            )
          : t(
              `端口 ${servicePort} 已被占用。请先退出旧版 PointDOM 或占用端口的程序。`,
              `Port ${servicePort} is in use. Quit the previous PointDOM service or the app using this port.`,
            )
        : serviceProblem === 'SERVICE_BIND_FAILED'
          ? t(
              '无法启动本地服务，请检查网络权限后重试。',
              'Could not start the local service. Check network permissions, then retry.',
            )
          : serviceProblem === 'SERVICE_OFFLINE' || serviceProblem === 'RECONNECT_FAILED'
            ? t(
                '重连失败，本地服务仍未启动。请重试。',
                'Reconnect failed. The local service has not started. Please retry.',
              )
            : reconnectPhase === 'failed'
              ? t(`重连失败：${serviceProblem}`, `Reconnect failed: ${serviceProblem}`)
              : serviceProblem === 'STATE_UNAVAILABLE'
                ? t('无法读取本地状态', 'Local state unavailable')
                : serviceProblem;
  const projectCandidates = (state?.discovery?.candidates || []).filter(
    (candidate) =>
      !state?.projects.some((project) => project.cwd === candidate.cwd && project.localDiscovery),
  );
  const jobs = state?.jobs || [];
  const taskNumbers = new Map(jobs.map((job, index) => [job.id, jobs.length - index]));
  const running = jobs.filter((job) => job.status === 'running').length;
  const queued = jobs.filter((job) => job.status === 'queued').length;
  const focused = jobs.find((job) => job.id === selected);
  const statusText = (job: Job) =>
    ({
      queued: t('待领取', 'Queued'),
      running: t('执行中', 'Running'),
      waiting: t('等待操作', 'Needs attention'),
      completed: t('已完成', 'Completed'),
      failed: t('失败', 'Failed'),
      cancelled: t('已取消', 'Cancelled'),
      interrupted: t('已中断', 'Interrupted'),
    })[job.status];
  const projectName = (id: string) =>
    state?.projects.find((p) => p.id === id)?.name ||
    state?.projectNames?.[id] ||
    t('未找到项目', 'Unknown project');
  const taskDetails = focused ? (
    <Card id={`task-details-${focused.id}`} className="task-detail">
      <>
        <div className="detail-heading">
          <span className={`status status-${focused.status}`}>{statusText(focused)}</span>
          <small>{formatTaskDuration(focused, language === 'en' ? 'en' : 'zh-CN') || ''}</small>
        </div>
        <h2>{taskDescription(focused)}</h2>
        <dl>
          <div>
            <dt>{t('项目', 'Project')}</dt>
            <dd>{projectName(focused.projectId)}</dd>
          </div>
          <div>
            <dt>{t('执行客户端', 'Client')}</dt>
            <dd>{focused.recipient?.name || focused.agent || 'MCP'}</dd>
          </div>
        </dl>
        <div className="activity">
          <h3>{t('执行记录', 'Activity')}</h3>
          {focused.events.length ? (
            focused.events.map((event, index) => (
              <div className="activity-row" key={`${event.at}-${index}`}>
                <span className="activity-dot" />
                <p>{taskMessage(event.text, t)}</p>
                <time>
                  {new Date(event.at).toLocaleTimeString(language, {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </time>
              </div>
            ))
          ) : (
            <p className="muted">{t('暂无执行记录', 'No activity yet')}</p>
          )}
        </div>
        {focused.error ? <p className="notice error">{taskMessage(focused.error, t)}</p> : null}
        {focused.result ? (
          <div className="result">
            <h3>{t('执行结果', 'Result')}</h3>
            <pre>{focused.result}</pre>
          </div>
        ) : null}
        {!terminal(focused.status) ? (
          <Button
            variant="secondary"
            isDisabled={busy}
            onPress={() =>
              void run(async () => {
                notify(cancellationMessage(await native.cancel(focused.id), t));
              })
            }
          >
            {t('取消批注', 'Cancel annotation')}
          </Button>
        ) : null}
        <Button
          variant="ghost"
          className="task-collapse"
          onPress={() => {
            const row = document.getElementById(`task-row-${focused.id}`);
            row?.focus({ preventScroll: true });
            setSelected('');
            row?.scrollIntoView({
              block: 'nearest',
              behavior: reduceMotion ? 'instant' : 'smooth',
            });
          }}
        >
          {t('收起', 'Collapse')}
          <UiIcon name="chevron" />
        </Button>
      </>
    </Card>
  ) : null;
  const taskRow = (job: Job, compact = false) => (
    <Button
      key={job.id}
      id={compact ? undefined : `task-row-${job.id}`}
      variant="tertiary"
      className={`task-card ${selected === job.id ? 'selected' : ''}`}
      data-status={job.status}
      aria-expanded={compact ? undefined : selected === job.id}
      aria-controls={!compact && selected === job.id ? `task-details-${job.id}` : undefined}
      aria-pressed={!compact && selected === job.id}
      onPress={() =>
        compact
          ? void run(() => native.openMain(job.id))
          : setSelected(selected === job.id ? '' : job.id)
      }
    >
      <span className="task-number">{taskNumbers.get(job.id)}</span>
      {job.status !== 'completed' ? (
        <span className="task-symbol" aria-hidden="true">
          <UiIcon
            name={
              job.status === 'failed' ? 'error' : job.status === 'running' ? 'running' : 'waiting'
            }
            className={job.status === 'running' ? 'task-orbit' : ''}
          />
        </span>
      ) : null}
      <span className="task-copy">
        <strong>{taskTitle(job)}</strong>
        <small>
          {projectName(job.projectId)} · {job.recipient?.name || job.agent || 'MCP'}
        </small>
      </span>
      <span className={`status status-${job.status}`}>{statusText(job)}</span>
    </Button>
  );
  if (tray)
    return (
      <main className="tray-shell">
        <header className="tray-header">
          <div className="brand">
            <img src="logo.svg" alt="" />
            <strong>PointDOM</strong>
          </div>
          <span className={`connection ${state?.connected ? 'online' : ''}`}>
            {state?.connected ? t('已连接', 'Connected') : t('未连接', 'Offline')}
          </span>
        </header>
        <div className="tray-summary">
          <span>
            <b>{running}</b>
            {t('执行中', 'running')}
          </span>
          <span>
            <b>{queued}</b>
            {t('排队中', 'queued')}
          </span>
          <Button variant="tertiary" onPress={() => void run(() => native.openMain())}>
            {t('全部任务', 'All tasks')} <UiIcon name="open" />
          </Button>
        </div>
        {error ? (
          <p role="alert" className="notice error">
            {error}
          </p>
        ) : null}
        <div className="tray-list">
          {jobs.length ? (
            [...jobs.filter((j) => !terminal(j.status)), ...jobs.filter((j) => terminal(j.status))]
              .slice(0, 8)
              .map((job) => taskRow(job, true))
          ) : (
            <div className="empty">
              <img src="logo.svg" alt="" />
              <strong>{t('暂无任务', 'No tasks')}</strong>
              <p>
                {t('在网页提交批注即可创建任务。', 'Submit a page annotation to create a task.')}
              </p>
            </div>
          )}
        </div>
        <footer className="tray-footer">{t('进度由客户端更新', 'Updates from your client')}</footer>
      </main>
    );
  const projectsEmpty = Boolean(state && !state.projects.length && !projectCandidates.length);
  const addProjectButton = (
    <Button
      variant="secondary"
      isDisabled={busy || !state?.connected}
      onPress={() => {
        setManualSetup(true);
        setScreen('settings');
      }}
    >
      {t('添加项目', 'Add project')}
    </Button>
  );
  const nav: [Screen, string, string][] = [
    ['tasks', '任务', 'Tasks'],
    ['projects', '项目', 'Projects'],
    ['clients', '客户端', 'Clients'],
    ['settings', '设置', 'Settings'],
    ['about', '关于', 'About'],
  ];
  return (
    <>
      <Tabs
        className="desktop-shell"
        variant="secondary"
        selectedKey={screen}
        onSelectionChange={(key: string | number) => {
          if (
            key === 'tasks' ||
            key === 'projects' ||
            key === 'clients' ||
            key === 'settings' ||
            key === 'about'
          )
            setScreen(key);
        }}
      >
        <header className="app-toolbar">
          <Tabs.ListContainer className="app-tabs-container">
            <Tabs.List className="app-tabs" aria-label={t('主导航', 'Main navigation')}>
              {nav.map(([id, zh, en]) => (
                <Tabs.Tab key={id} id={id} className="app-tab" textValue={t(zh, en)}>
                  <UiIcon name={id} />
                  <span>{t(zh, en)}</span>
                </Tabs.Tab>
              ))}
            </Tabs.List>
          </Tabs.ListContainer>
        </header>
        <main className="workspace">
          {state?.pairingRequests?.map((request) => (
            <div className="notice pairing-notice connection-row" key={request.id}>
              <div>
                <strong>Chrome</strong>
                <small className="folder">{request.id}</small>
              </div>
              <Button
                variant="secondary"
                isDisabled={busy}
                onPress={() =>
                  void run(async () => {
                    await native.approveExtension(request.id, request.challenge);
                    notify(t('已允许连接', 'Connection approved'));
                  })
                }
              >
                {t('允许连接', 'Allow connection')}
              </Button>
            </div>
          ))}

          {error || (screen !== 'about' && (state?.error || reconnectPhase === 'pending')) ? (
            <div
              className="notice error"
              role={reconnectPhase === 'pending' ? 'status' : 'alert'}
              aria-busy={reconnectPhase === 'pending'}
            >
              <span>{serviceMessage}</span>
              {screen !== 'about' ? (
                <Button
                  variant="tertiary"
                  isPending={reconnectPhase === 'pending'}
                  isDisabled={busy && reconnectPhase !== 'pending'}
                  onPress={() => void reconnect()}
                >
                  {reconnectPhase === 'pending'
                    ? t('正在重连…', 'Reconnecting…')
                    : t('重新连接', 'Reconnect')}
                </Button>
              ) : null}
            </div>
          ) : null}
          <Tabs.Panel id="tasks" data-screen="tasks" className="app-panel tasks-panel">
            <div className="panel-content">
              <div className="page-heading">
                <h1>{t('任务', 'Tasks')}</h1>
              </div>
              <section className="summary-grid" aria-label={t('任务概况', 'Task overview')}>
                <Card className="metric">
                  <span>{t('正在执行', 'Running')}</span>
                  <strong>
                    {running}
                    <span className={`live-mark ${running ? 'working' : ''}`} />
                  </strong>
                </Card>
                <Card className="metric">
                  <span>{t('等待执行', 'Waiting to run')}</span>
                  <strong>{queued}</strong>
                </Card>
                <Card className="metric">
                  <span>{t('客户端连接', 'Connections')}</span>
                  <strong>{state?.agents.length || 0}</strong>
                </Card>
              </section>
              <div className="task-workspace">
                <section className="task-list-pane">
                  <div className="project-filters" aria-label={t('项目筛选', 'Project filter')}>
                    <Button
                      variant="tertiary"
                      aria-pressed={!project}
                      onPress={() => {
                        setProject('');
                        setSelected('');
                      }}
                    >
                      {t('全部项目', 'All projects')}
                    </Button>
                    {state?.projects.map((item) => (
                      <Button
                        key={item.id}
                        variant="tertiary"
                        aria-pressed={project === item.id}
                        onPress={() => {
                          setProject(item.id);
                          setSelected('');
                        }}
                      >
                        {item.name}
                      </Button>
                    ))}
                  </div>
                  <div className="list-heading">
                    <h2>{project ? projectName(project) : t('最近任务', 'Recent tasks')}</h2>
                    <div className="filter-controls">
                      <Button
                        variant="tertiary"
                        aria-pressed={filter === 'all'}
                        onPress={() => setFilter('all')}
                      >
                        {t('全部', 'All')}
                      </Button>
                      <Button
                        variant="tertiary"
                        aria-pressed={filter === 'active'}
                        onPress={() => setFilter('active')}
                      >
                        {t('进行中', 'Active')}
                      </Button>
                    </div>
                  </div>
                  <div className="task-list">
                    {jobs
                      .filter(
                        (j) =>
                          (!project || j.projectId === project) &&
                          (filter === 'all' || !terminal(j.status)),
                      )
                      .map((job) => (
                        <div className="task-entry" key={job.id}>
                          {taskRow(job)}
                          <AnimatePresence initial={false}>
                            {selected === job.id ? (
                              <motion.div
                                key={job.id}
                                className="task-expansion"
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{
                                  duration: reduceMotion ? 0 : 0.2,
                                  ease: [0.22, 1, 0.36, 1],
                                }}
                              >
                                <div className="task-expansion-content">{taskDetails}</div>
                              </motion.div>
                            ) : null}
                          </AnimatePresence>
                        </div>
                      ))}
                    {!jobs.some(
                      (j) =>
                        (!project || j.projectId === project) &&
                        (filter === 'all' || !terminal(j.status)),
                    ) ? (
                      <Card className="empty">
                        <img src="logo.svg" alt="" />
                        <strong>{t('暂无任务', 'No tasks')}</strong>
                        <p>
                          {t(
                            '在网页选择元素并提交批注。',
                            'Select an element on a page and submit an annotation.',
                          )}
                        </p>
                        <Button
                          variant="secondary"
                          onPress={() => setScreen(state?.projects.length ? 'clients' : 'projects')}
                        >
                          {t('配置连接', 'Set up')}
                        </Button>
                      </Card>
                    ) : null}
                  </div>
                </section>
              </div>
            </div>
          </Tabs.Panel>
          <Tabs.Panel id="projects" data-screen="projects" className="app-panel">
            <div className="panel-content">
              <div className="page-heading projects-heading">
                <h1>{t('项目', 'Projects')}</h1>
                {!projectsEmpty ? addProjectButton : null}
              </div>
              <div className="settings-grid">
                {projectsEmpty ? (
                  <Card className="empty">
                    <strong>{t('暂无项目', 'No projects')}</strong>
                    <p>
                      {state?.connected
                        ? t('添加本地项目即可开始。', 'Add a local project to get started.')
                        : t('连接服务后可添加项目。', 'Connect the service to add projects.')}
                    </p>
                    {addProjectButton}
                  </Card>
                ) : null}
                {projectCandidates.map((candidate) => (
                  <Card className="panel-card" key={candidate.id}>
                    <strong>{candidate.name}</strong>
                    <small className="folder">{candidate.cwd}</small>
                    <p>{candidate.origins.join(' · ')}</p>
                    <Button
                      isDisabled={busy}
                      onPress={() =>
                        void run(async () => {
                          try {
                            await native.confirmDiscovery(candidate.id);
                            notify(t('项目已连接', 'Project connected'));
                          } catch (cause) {
                            if (cause === 'DEVELOPMENT_SERVER_CHANGED') {
                              notify(
                                t(
                                  '开发服务已变化，请选择当前项目。',
                                  'The development server changed. Choose its current entry.',
                                ),
                              );
                            } else throw cause;
                          }
                        })
                      }
                    >
                      {t('连接项目', 'Connect project')}
                    </Button>
                  </Card>
                ))}
                <div className="project-grid">
                  {state?.projects.map((p) => (
                    <Card className="panel-card project-card" key={p.id}>
                      <div className="project-heading">
                        <h2>{p.name}</h2>
                        <Button
                          isIconOnly
                          variant="tertiary"
                          className="project-remove"
                          aria-label={t('移除项目', 'Remove project')}
                          isDisabled={busy}
                          onPress={() =>
                            void run(async () => {
                              try {
                                if (await native.removeProject(p.id)) {
                                  if (project === p.id) setProject('');
                                  if (setupCopy?.id === p.id) setSetupCopy(undefined);
                                  notify(t('项目已移除', 'Project removed'));
                                }
                              } catch (cause) {
                                if (cause === 'PROJECT_HAS_ACTIVE_TASKS')
                                  throw t(
                                    '请先完成或取消该项目的待处理任务。',
                                    'Finish or cancel this project’s pending tasks first.',
                                  );
                                throw cause;
                              }
                            })
                          }
                        >
                          <UiIcon name="delete" />
                        </Button>
                      </div>
                      <p className="project-address">
                        {p.origins.length ? p.origins.join(' · ') : t('未运行', 'Not running')}
                      </p>
                      <small className="folder project-folder">{p.cwd}</small>
                      <div className="project-actions">
                        <Button
                          variant="secondary"
                          aria-label={t('打开网页', 'Open website')}
                          isDisabled={
                            !p.origins.length ||
                            (p.localDiscovery &&
                              !p.origins.some((origin) =>
                                ['localhost', '127.0.0.1', '[::1]'].includes(
                                  new URL(origin).hostname,
                                ),
                              ))
                          }
                          onPress={() => void run(() => native.openProject(p.id))}
                        >
                          <UiIcon name="open" />
                          {t('打开', 'Open')}
                        </Button>
                        <Button
                          variant="secondary"
                          className="project-copy"
                          aria-label={t('复制 Codex 连接指令', 'Copy Codex setup instruction')}
                          onPress={() => {
                            const text = wakeupInstruction(
                              language === 'en' ? 'en' : 'zh-CN',
                              p,
                              '',
                            );
                            void (async () => {
                              try {
                                setCopiedProject('');
                                await navigator.clipboard.writeText(text);
                                setSetupCopy(undefined);
                                setCopiedProject(p.id);
                              } catch {
                                setSetupCopy({ id: p.id, text });
                              }
                            })();
                          }}
                        >
                          <span className="project-copy-slot" aria-live="polite">
                            <AnimatePresence initial={false} mode="wait">
                              <motion.span
                                className="project-copy-feedback"
                                key={copiedProject === p.id ? 'copied' : 'copy'}
                                initial={{ opacity: 0, y: reduceMotion ? 0 : 4 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: reduceMotion ? 0 : -4 }}
                                transition={{ duration: reduceMotion ? 0 : 0.12 }}
                              >
                                <UiIcon name={copiedProject === p.id ? 'check' : 'copy'} />
                                {copiedProject === p.id ? t('已复制', 'Copied') : t('复制', 'Copy')}
                              </motion.span>
                            </AnimatePresence>
                          </span>
                        </Button>
                        <Button
                          variant="secondary"
                          aria-label={t('查看任务', 'View tasks')}
                          onPress={() => {
                            setProject(p.id);
                            setScreen('tasks');
                          }}
                        >
                          <UiIcon name="tasks" />
                          {t('查看', 'View')}
                        </Button>
                      </div>
                      {setupCopy?.id === p.id ? (
                        <pre className="config-output" tabIndex={0}>
                          {setupCopy.text}
                        </pre>
                      ) : null}
                    </Card>
                  ))}
                </div>
              </div>
            </div>
          </Tabs.Panel>
          <Tabs.Panel id="clients" data-screen="clients" className="app-panel">
            <div className="panel-content">
              <div className="page-heading">
                <h1>{t('客户端', 'Clients')}</h1>
              </div>
              <div className="settings-grid">
                <Card className="panel-card">
                  <h2>{t('连接客户端', 'Connect a client')}</h2>
                  <p>
                    {t(
                      '通过 MCP 连接，由客户端执行修改。',
                      'Connect over MCP. Your client handles changes.',
                    )}
                  </p>
                  <div className="client-option">
                    <div className="client-avatar">
                      <UiIcon name="terminal" />
                    </div>
                    <div>
                      <strong>Codex</strong>
                      <p>{t('MCP · 支持按任务唤醒', 'MCP · Task-triggered wakeup')}</p>
                    </div>
                    <Button
                      variant="secondary"
                      isDisabled={busy}
                      onPress={() =>
                        void run(async () => {
                          const refreshed = await native.connectCodex();
                          notify(
                            refreshed
                              ? t(
                                  '配置已刷新。在目标对话启用任务唤醒。',
                                  'Configuration refreshed. Enable task wakeup in the intended conversation.',
                                )
                              : t(
                                  '已保存。首次使用请在 Codex 的 MCP servers 中启用 PointDOM，并点击 Restart。',
                                  'Saved. For first use, enable PointDOM in Codex MCP servers and click Restart.',
                                ),
                          );
                        })
                      }
                    >
                      {t('配置', 'Configure')}
                    </Button>
                  </div>
                  <div className="client-option">
                    <div className="client-avatar">
                      <UiIcon name="code" />
                    </div>
                    <div>
                      <strong>{t('其他 MCP 客户端', 'Other MCP clients')}</strong>
                      <p>{t('标准 MCP 连接', 'Standard MCP connection')}</p>
                    </div>
                    <Button
                      variant="tertiary"
                      isDisabled={busy}
                      onPress={() => void run(async () => setConfig(await native.configuration()))}
                    >
                      {t('连接配置', 'Configuration')}
                    </Button>
                  </div>
                  {config ? (
                    <pre className="config-output" tabIndex={0}>
                      {config}
                    </pre>
                  ) : null}
                  <small>
                    {t(
                      '自动接收任务需启用监听或按任务唤醒。',
                      'Enable listening or task wakeup to receive tasks automatically.',
                    )}
                  </small>
                </Card>
                <Card className="panel-card">
                  <h2>{t('当前连接', 'Live connections')}</h2>
                  {state?.agents.length ? (
                    state.agents.map((a) => (
                      <div className="connection-row" key={a.id}>
                        <span className="connection online" />
                        <div>
                          <strong>{a.name}</strong>
                          <small>
                            {projectName(a.projectId)} · {a.id.slice(0, 8)}
                          </small>
                        </div>
                        <span className="status">
                          {a.wakeable
                            ? t('按任务唤醒', 'Wakes on task')
                            : a.listening
                              ? t('监听中', 'Listening')
                              : t('未监听', 'Not listening')}
                        </span>
                      </div>
                    ))
                  ) : (
                    <p className="muted">{t('暂无连接', 'No connections')}</p>
                  )}
                </Card>
              </div>
            </div>
          </Tabs.Panel>
          <Tabs.Panel id="settings" data-screen="settings" className="app-panel">
            <div className="panel-content">
              <div className="page-heading">
                <h1>{t('设置', 'Settings')}</h1>
              </div>
              <div className="settings-grid">
                <Card className="panel-card">
                  <div className="group-heading">
                    <h2>{t('Chrome 扩展', 'Chrome extension')}</h2>
                    <span className={`status ${state?.paired ? 'status-completed' : ''}`}>
                      {state?.paired ? t('已配对', 'Paired') : t('未配对', 'Not paired')}
                    </span>
                  </div>
                  <ol>
                    <li>
                      {t(
                        '打开扩展管理，开启开发者模式。',
                        'Open Extensions and enable Developer mode.',
                      )}
                    </li>
                    <li>
                      {t(
                        '加载 PointDOM 扩展文件夹。',
                        'Load the unpacked PointDOM extension folder.',
                      )}
                    </li>
                    <li>
                      {t('加载后，在此确认连接。', 'After loading, confirm the connection here.')}
                    </li>
                  </ol>
                  <div className="actions">
                    <Button variant="secondary" onPress={() => void run(native.openExtensions)}>
                      {t('打开扩展管理', 'Open Extensions')}
                    </Button>
                    <Button variant="tertiary" onPress={() => void run(native.revealExtension)}>
                      {t('显示扩展文件夹', 'Show extension folder')}
                    </Button>
                  </div>
                </Card>
                <Card className="panel-card">
                  <h2>{t('高级', 'Advanced')}</h2>
                  <Button
                    variant="tertiary"
                    aria-expanded={manualSetup}
                    onPress={() => setManualSetup(!manualSetup)}
                  >
                    {t('手动添加项目', 'Add project manually')}
                  </Button>
                  {manualSetup ? (
                    <form
                      id="manual-project-form"
                      onSubmit={(e) => {
                        e.preventDefault();
                        void run(async () => {
                          await native.addProject(name, origin);
                          setFolder('');
                          setName('');
                          setOrigin('');
                          setScreen('projects');
                          notify(t('项目已添加', 'Project added'));
                        });
                      }}
                    >
                      <Button
                        variant="secondary"
                        isDisabled={busy || !state?.connected}
                        onPress={() =>
                          void run(async () => {
                            const path = await native.chooseFolder();
                            setFolder(path || '');
                            if (path) setName(path.split(/[\\/]/).at(-1) || '');
                          })
                        }
                      >
                        {t('选择源码文件夹', 'Choose source folder')}
                      </Button>
                      <small className="folder">
                        {folder || t('尚未选择文件夹', 'No folder selected')}
                      </small>

                      <TextField value={origin} onChange={setOrigin} isRequired type="url">
                        <Label>{t('网页地址', 'Website URL')}</Label>
                        <Input placeholder="http://localhost:3000" />
                      </TextField>
                      <Button
                        type="submit"
                        isDisabled={busy || !folder || !name.trim() || !/^https?:\/\//.test(origin)}
                      >
                        {t('添加项目', 'Add project')}
                      </Button>
                    </form>
                  ) : null}
                </Card>
                <Card className="panel-card appearance-card">
                  <h2>{t('外观', 'Appearance')}</h2>
                  <Switch
                    className="menu-bar-setting"
                    size="lg"
                    isSelected={state?.appSettings.showMenuBarIcon ?? true}
                    isDisabled={busy || !state}
                    onChange={(visible: boolean) =>
                      void run(() => native.setMenuBarVisibility(visible))
                    }
                  >
                    <Switch.Content className="setting-row">
                      <Label>{t('显示菜单栏图标', 'Show menu bar icon')}</Label>
                      <Switch.Control>
                        <Switch.Thumb />
                      </Switch.Control>
                    </Switch.Content>
                  </Switch>
                  <div className="setting-row">
                    <span>{t('主题', 'Theme')}</span>
                    <ToggleButtonGroup
                      className="desktop-theme-switch"
                      aria-label={t('主题', 'Theme')}
                      selectionMode="single"
                      disallowEmptySelection
                      selectedKeys={[themeMode]}
                      onSelectionChange={(keys: Selection) => {
                        const mode = [...keys][0];
                        if (mode === 'light' || mode === 'dark' || mode === 'system')
                          setThemeMode(mode);
                      }}
                    >
                      {(
                        [
                          { id: 'light', icon: 'sun', label: t('浅色', 'Light') },
                          { id: 'dark', icon: 'moon', label: t('深色', 'Dark') },
                          { id: 'system', icon: 'system', label: t('跟随系统', 'System') },
                        ] as const
                      ).map((mode) => (
                        <ToggleButton key={mode.id} id={mode.id} isIconOnly aria-label={mode.label}>
                          <UiIcon name={mode.icon} />
                        </ToggleButton>
                      ))}
                    </ToggleButtonGroup>
                  </div>
                  <div className="setting-row">
                    <span>{t('语言', 'Language')}</span>
                    <Dropdown>
                      <Dropdown.Trigger
                        className="appearance-icon language-trigger"
                        aria-label={t('选择语言', 'Choose a language')}
                      >
                        <UiIcon name="language" />
                      </Dropdown.Trigger>
                      <Dropdown.Popover className="language-popover" placement="bottom end">
                        <Dropdown.Menu
                          aria-label={t('选择语言', 'Choose a language')}
                          selectionMode="single"
                          disallowEmptySelection
                          selectedKeys={[language]}
                          onSelectionChange={(keys: Selection) => {
                            const selected = [...keys][0];
                            if (selected === 'en' || selected === 'zh-CN')
                              void run(async () => {
                                await native.setLanguage(selected);
                                setLanguage(selected);
                              });
                          }}
                        >
                          {languages.map((item) => (
                            <Dropdown.Item key={item.id} id={item.id} textValue={item.label}>
                              <Label>{item.label}</Label>
                              <Dropdown.ItemIndicator className="language-check" />
                            </Dropdown.Item>
                          ))}
                        </Dropdown.Menu>
                      </Dropdown.Popover>
                    </Dropdown>
                  </div>
                </Card>
              </div>
            </div>
          </Tabs.Panel>
          <Tabs.Panel id="about" data-screen="about" className="app-panel about-panel">
            <div className="panel-content">
              <section className="about-identity" aria-label={t('关于 PointDOM', 'About PointDOM')}>
                <img src="logo.svg" alt="" />
                <h1>PointDOM</h1>
                <p>
                  {t(
                    '网页批注，交给客户端执行。',
                    'Annotate a page. Your client makes the changes.',
                  )}
                </p>
                <span className="version-badge">
                  {t('版本', 'Version')} {state?.appVersion || '—'}
                </span>
              </section>
              <Card className="about-links">
                {(
                  [
                    ['repository', t('项目主页', 'Project home'), 'GitHub'],
                    ['releases', t('发布版本', 'Releases'), state?.appVersion || '—'],
                    ['feedback', t('问题反馈', 'Feedback'), t('GitHub Issues', 'GitHub Issues')],
                  ] as const
                ).map(([resource, label, detail]) => (
                  <Button
                    key={resource}
                    variant="tertiary"
                    className="about-link"
                    isDisabled={busy}
                    onPress={() => void run(() => native.openResource(resource))}
                  >
                    <span>{label}</span>
                    <small className={resource === 'releases' ? 'release-version' : undefined}>
                      {detail}
                    </small>
                    <UiIcon name="open" />
                  </Button>
                ))}
              </Card>
              <p className="about-license">{t('MIT 开源许可', 'MIT License')} · PointDOM</p>
            </div>
          </Tabs.Panel>
        </main>
        <footer className="app-footer">
          <span className={`connection ${state?.connected ? 'online' : ''}`}>
            {state?.connected
              ? t('服务已连接', 'Service connected')
              : t('服务未连接', 'Service offline')}
          </span>
        </footer>
      </Tabs>
      <Toast.Provider queue={notices} className="app-toasts" placement="bottom" width={360}>
        {({ toast }: { toast: QueuedToast<{ message: string }> }) => (
          <Toast toast={toast} className="app-toast">
            <Toast.Indicator>
              <UiIcon name="check" />
            </Toast.Indicator>
            <Toast.Content>
              <Toast.Title>{toast.content.message}</Toast.Title>
            </Toast.Content>
            <Toast.CloseButton aria-label={t('关闭提示', 'Dismiss notification')}>
              <UiIcon name="close" />
            </Toast.CloseButton>
          </Toast>
        )}
      </Toast.Provider>
    </>
  );
}
const root = document.getElementById('root');
if (root) createRoot(root).render(<Desktop />);
