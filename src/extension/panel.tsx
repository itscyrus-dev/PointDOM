import { elementType, shortLabel, styleGroups } from './element-info.js';
import { checkLatestRelease } from './release-check.js';
import { logoFrame, logoDot } from './brand.js';
import { formatTaskDuration } from './task-duration.js';
import { cliIds } from '../shared/cli.js';
import { executorName } from '../shared/contracts.js';
import {
  createContext,
  memo,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
  type ChangeEvent,
  type SVGProps,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { createRoot } from 'react-dom/client';
import { I18nProvider, type Selection as AriaSelection } from 'react-aria-components';
import { Button as HeroButton, type ButtonProps } from '@heroui/react/button';
import { Card } from '@heroui/react/card';
import { Select } from '@heroui/react/select';
import { ListBox } from '@heroui/react/list-box';
import { Label } from '@heroui/react/label';
import { TextArea } from '@heroui/react/textarea';
import { Input } from '@heroui/react/input';
import { Disclosure } from '@heroui/react/disclosure';
import { Popover } from '@heroui/react/popover';
import { terminal, type Job, type Selection } from '../shared/contracts.js';
import { controller, linkedSites, type Notice, type PanelState } from './panel-controller.js';
import type { Preferences } from './ui-preferences.js';
import { ToggleButtonGroup } from '@heroui/react/toggle-button-group';
import { ToggleButton } from '@heroui/react/toggle-button';
import { Dropdown } from '@heroui/react/dropdown';

type Translator = (zh: string, en: string) => string;
const translators: Record<Preferences['language'], Translator> = {
  'zh-CN': (zh) => zh,
  en: (_zh, en) => en,
};
const Locale = createContext<Translator>(translators['zh-CN']);
function Chevron({ className = '', ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      className={`dropdown-chevron ${className}`}
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path d="m7 10 5 5 5-5" />
    </svg>
  );
}
function Icon({
  name,
}: {
  name:
    | 'settings'
    | 'sun'
    | 'moon'
    | 'system'
    | 'language'
    | 'pick'
    | 'send'
    | 'refresh'
    | 'folder'
    | 'close'
    | 'back'
    | 'check';
}) {
  const paths = {
    settings: 'M4 7h16M4 17h16M8 4v6m8 4v6',
    sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5',
    moon: 'M20.8 13.3A9 9 0 0 1 10.7 3.2 9 9 0 1 0 20.8 13.3Z',
    system: 'M3 4h18v12H3zM8 21h8m-4-5v5',
    language: 'M3 5h12M9 3v2M6 5c0 5 3 8 7 9M12 5c0 4-3 8-8 10m10 6 4-10 4 10m-6-4h4',
    pick: 'M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5M9 9l9 4-4 1-1 4z',
    send: 'M7 17 17 7M7 7h10v10',
    refresh: 'M20 7v5h-5M4 17v-5h5M6 7a7 7 0 0 1 12-1l2 3M4 15l2 3a7 7 0 0 0 12-1',
    folder: 'M3 7h6l2 2h10v10H3zM3 7V5h6l2 2h8v2',
    close: 'm6 6 12 12M6 18 18 6',
    back: 'M19 12H5m7-7-7 7 7 7',
    check: 'm5 12 4 4L19 6',
  };
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d={paths[name]} />
    </svg>
  );
}
// Compose HeroUI variants so quiet controls never inherit the default primary states.
function Button({ className, variant, ...props }: ButtonProps) {
  const classes = typeof className === 'string' ? className.split(/\s+/) : [];
  const resolved =
    variant ??
    (classes.includes('primary')
      ? 'primary'
      : classes.includes('pick-button')
        ? 'outline'
        : classes.includes('quiet')
          ? 'ghost'
          : 'secondary');
  return <HeroButton {...props} className={className} variant={resolved} />;
}
function AsyncButton({
  run,
  children,
  isDisabled,
  ...props
}: Omit<ButtonProps, 'onPress'> & { run: () => Promise<unknown> }) {
  const [busy, setBusy] = useState(false);
  const active = useRef(false);
  return (
    <Button
      {...props}
      isDisabled={isDisabled || busy}
      isPending={busy}
      onPress={() => {
        if (active.current) return;
        active.current = true;
        setBusy(true);
        void run()
          .catch(controller.fail)
          .finally(() => {
            active.current = false;
            setBusy(false);
          });
      }}
    >
      {children}
    </Button>
  );
}
function FieldSelect({
  id,
  label,
  value,
  items,
  onChange,
  className = '',
  isDisabled = false,
}: {
  id: string;
  label: string;
  value: string;
  items: { id: string; name: string }[];
  onChange: (value: string) => void;
  className?: string;
  isDisabled?: boolean;
}) {
  return (
    <Select
      className={`pd-select ${className}`}
      name={id}
      value={value || '__default__'}
      onChange={(key: string | number | null) =>
        onChange(key === '__default__' || key === null ? '' : String(key))
      }
      fullWidth
      isDisabled={isDisabled}
    >
      <Label>{label}</Label>
      <Select.Trigger id={id} data-value={value}>
        <Select.Value />
        <Select.Indicator>
          <Chevron />
        </Select.Indicator>
      </Select.Trigger>
      <Select.Popover className="pd-select-popover">
        <ListBox>
          {items.map((item) => (
            <ListBox.Item
              key={item.id || '__default__'}
              id={item.id || '__default__'}
              textValue={item.name}
            >
              {item.name}
              <ListBox.ItemIndicator />
            </ListBox.Item>
          ))}
        </ListBox>
      </Select.Popover>
    </Select>
  );
}
function Fold({
  title,
  count,
  detail,
  children,
  open = false,
  className = '',
}: {
  title: string;
  count?: number;
  detail?: string;
  children: ReactNode;
  open?: boolean;
  className?: string;
}) {
  return (
    <Disclosure className={`pd-fold ${className}`} defaultExpanded={open}>
      <Disclosure.Heading>
        <Disclosure.Trigger>
          <Disclosure.Indicator />
          <span className="fold-label">{title}</span>
          {count !== undefined ? <span className="fold-count">{count}</span> : null}
          {detail ? <span className="fold-detail">{detail}</span> : null}
        </Disclosure.Trigger>
      </Disclosure.Heading>
      <Disclosure.Content>
        <Disclosure.Body>{children}</Disclosure.Body>
      </Disclosure.Content>
    </Disclosure>
  );
}
function NoticeBox({ notice, id }: { notice: Notice | null; id: string }) {
  const t = useContext(Locale);
  return (
    <div id={id} role="status" aria-live="polite" className={notice?.error ? 'error' : ''}>
      {notice ? t(notice.zh, notice.en) : ''}
    </div>
  );
}
function HeaderPreferences({ preferences }: { preferences: Preferences }) {
  const t = useContext(Locale);
  return (
    <>
      <ToggleButtonGroup
        id="theme-mode"
        className="theme-mode-switch"
        aria-label={t('明暗模式', 'Color mode')}
        selectionMode="single"
        disallowEmptySelection
        selectedKeys={[preferences.mode]}
        onSelectionChange={(keys: AriaSelection) => {
          const mode = [...keys][0];
          if (mode === 'light' || mode === 'dark' || mode === 'system')
            controller.setPreferences({ mode });
        }}
      >
        {(
          [
            { id: 'light', icon: 'sun', label: t('浅色', 'Light') },
            { id: 'dark', icon: 'moon', label: t('深色', 'Dark') },
            { id: 'system', icon: 'system', label: t('跟随系统', 'System') },
          ] as const
        ).map((mode) => (
          <ToggleButton
            key={mode.id}
            id={mode.id}
            className="mode-button"
            isIconOnly
            aria-label={mode.label}
            title={mode.label}
          >
            <Icon name={mode.icon} />
          </ToggleButton>
        ))}
      </ToggleButtonGroup>
      <Dropdown>
        <Dropdown.Trigger
          id="language-toggle"
          className="quiet icon-button language-trigger"
          aria-label={t('语言', 'Language')}
          title={t('语言', 'Language')}
        >
          <Icon name="language" />
        </Dropdown.Trigger>
        <Dropdown.Popover className="language-popover" placement="bottom end">
          <Dropdown.Menu
            aria-label={t('语言', 'Language')}
            selectionMode="single"
            disallowEmptySelection
            selectedKeys={[preferences.language]}
            onSelectionChange={(keys: AriaSelection) => {
              const language = [...keys][0];
              if (language === 'zh-CN' || language === 'en')
                controller.setPreferences({ language });
            }}
          >
            <Dropdown.Item id="zh-CN" textValue="简体中文">
              <Label>简体中文</Label>
              <Dropdown.ItemIndicator className="language-check" />
            </Dropdown.Item>
            <Dropdown.Item id="en" textValue="English">
              <Label>English</Label>
              <Dropdown.ItemIndicator className="language-check" />
            </Dropdown.Item>
          </Dropdown.Menu>
        </Dropdown.Popover>
      </Dropdown>
    </>
  );
}
function ExecutionSettings({ state }: { state: PanelState }) {
  const t = useContext(Locale);
  const [open, setOpen] = useState(false);
  return (
    <Popover isOpen={open} onOpenChange={setOpen}>
      <Button
        id="execution-settings"
        className="quiet execution-trigger"
        aria-label={t('选择 CLI', 'Choose CLI')}
      >
        <span id="execution-summary">{executorName(state.cliExecutor)}</span>
        <Chevron />
      </Button>
      <Popover.Content className="execution-popover" placement="bottom end">
        <Popover.Dialog>
          <Popover.Heading>{t('执行工具', 'CLI executor')}</Popover.Heading>
          <ul className="client-directory" aria-label={t('CLI 列表', 'CLI executors')}>
            {cliIds
              .filter(
                (id) =>
                  state.connection === 'connected' &&
                  state.clis.some((cli) => cli.id === id && cli.available),
              )
              .map((id) => {
                const available =
                  state.connection === 'connected' &&
                  state.clis.some((cli) => cli.id === id && cli.available);
                return (
                  <li className="client-entry" data-client={id} key={id}>
                    <AsyncButton
                      className="quiet client-select"
                      isDisabled={!available}
                      aria-pressed={available && state.cliExecutor === id}
                      aria-label={t(`使用 ${executorName(id)}`, `Use ${executorName(id)}`)}
                      run={async () => {
                        await controller.setCli(id);
                        setOpen(false);
                      }}
                    >
                      <strong className="client-name">{executorName(id)}</strong>
                      {available && state.cliExecutor === id ? (
                        <Icon name="check" />
                      ) : (
                        <small className="client-status">
                          {available ? t('已检测到', 'Detected') : t('未检测到', 'Not detected')}
                        </small>
                      )}
                    </AsyncButton>
                  </li>
                );
              })}
          </ul>
          {!state.clis.some((cli) => cli.available) ? (
            <p className="cli-empty">{t('未检测到 CLI', 'No CLI detected')}</p>
          ) : null}
          <AsyncButton className="quiet cli-detect" run={() => controller.detectClis()}>
            {t('重新检测', 'Check again')}
          </AsyncButton>
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  );
}
function ElementDetails({ item }: { item: Selection }) {
  const t = useContext(Locale);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener('blur', close);
    chrome.tabs.onActivated.addListener(close);
    return () => {
      window.removeEventListener('blur', close);
      chrome.tabs.onActivated.removeListener(close);
    };
  }, [open]);
  const label = item.label || item.tag;
  const [showAll, setShowAll] = useState(false);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle');
  const groups = styleGroups(item.styles, showAll);
  return (
    <Popover isOpen={open} onOpenChange={setOpen}>
      <Button
        className="quiet element-details-trigger"
        aria-label={t(`查看 ${label} 的元素与样式`, `Inspect element and styles for ${label}`)}
      >
        {t('详情', 'Details')}
        <Chevron data-open={open || undefined} />
      </Button>
      <Popover.Content
        className="element-details-popover"
        placement="bottom end"
        offset={6}
        shouldFlip
      >
        <Popover.Dialog aria-label={t(`${label} · 元素与样式`, `${label} · Element and styles`)}>
          <div className="element-details-heading">
            <Popover.Heading>{label}</Popover.Heading>
            <Button
              className="quiet icon-button"
              aria-label={t('关闭元素详情', 'Close element details')}
              onPress={() => setOpen(false)}
            >
              <Icon name="close" />
            </Button>
          </div>
          <div className="element-details-meta">
            <code>{item.tag}</code>
            <span>
              {t('尺寸', 'Rendered size')} {Math.round(item.rect.width)} ×{' '}
              {Math.round(item.rect.height)} px
            </span>
          </div>
          <div className="element-details-body">
            <div className="element-selector">
              <div className="element-selector-heading">
                <small>{t('选择器', 'Selector')}</small>
                <AsyncButton
                  className="quiet copy-selector"
                  aria-label={t('复制选择器', 'Copy selector')}
                  run={async () => {
                    try {
                      await navigator.clipboard.writeText(item.selector);
                      setCopyState('copied');
                    } catch {
                      setCopyState('error');
                    }
                  }}
                >
                  {copyState === 'copied' ? t('已复制', 'Copied') : t('复制', 'Copy')}
                </AsyncButton>
              </div>
              <code>{item.selector}</code>
              {copyState === 'error' ? (
                <small role="alert">{t('复制失败，请重试。', 'Copy failed. Try again.')}</small>
              ) : null}
            </div>
            {item.dom ? (
              <Fold title={t('DOM 结构', 'DOM structure')} className="element-dom">
                <pre>{item.dom.html || `<${item.tag}>`}</pre>
                {item.dom.ancestors.length ? (
                  <p className="dom-ancestors">
                    <small>{t('父级', 'Parents')}</small>
                    <code>
                      {[...item.dom.ancestors]
                        .reverse()
                        .map(
                          (node) =>
                            node.tag +
                            (node.attributes.id
                              ? `#${node.attributes.id}`
                              : node.attributes.class
                                ? '.' + node.attributes.class.split(/\s+/).slice(0, 2).join('.')
                                : ''),
                        )
                        .join(' > ')}
                    </code>
                  </p>
                ) : null}
                {item.dom.truncated ? <small>{t('片段已截断', 'Excerpt truncated')}</small> : null}
              </Fold>
            ) : null}
            <div className="element-style-heading">
              <small>{t('选取时快照', 'Captured styles')}</small>
              <Button className="quiet" aria-pressed={showAll} onPress={() => setShowAll(!showAll)}>
                {showAll ? t('精简显示', 'Show less') : t('显示全部', 'Show all')}
              </Button>
            </div>
            {groups.map((group) => (
              <section className="element-style-group" key={group.name[1]}>
                <h3>{t(...group.name)}</h3>
                <dl className="element-style-list">
                  {group.entries.map(([property, value]) => (
                    <div key={property}>
                      <dt>{property}</dt>
                      <dd>
                        {(property === 'color' || property === 'background-color') &&
                        CSS.supports('color', value) ? (
                          <span
                            className="style-color-swatch"
                            style={{ backgroundColor: value }}
                            aria-hidden="true"
                          />
                        ) : null}
                        {value}
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>
            ))}
          </div>
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  );
}
function Composer({ state }: { state: PanelState }) {
  const t = useContext(Locale);
  const composing = useRef(false);
  const canSubmit =
    state.ready &&
    state.connection === 'connected' &&
    !!state.projectId &&
    state.clis.some((cli) => cli.id === state.cliExecutor && cli.available) &&
    !!(state.draft.trim() || state.selections.some((s) => s.description?.trim())) &&
    !state.submitting;
  const project = state.projects.find((p) => p.id === state.projectId);
  return (
    <section className="fixed-composer">
      <div className="composer-caption">
        <span className="project-icon">
          <Icon name="folder" />
        </span>
        <small id="project-path" title={project?.cwd}>
          {project?.name ||
            (state.connection === 'connected'
              ? !state.origin
                ? t('请在设置中启用项目网页访问', 'Enable project page access in Settings')
                : t('请先选择代码项目', 'Choose a code project')
              : t('请先连接本地服务', 'Connect the local service'))}
        </small>
        <small id="page-origin">{state.origin ? new URL(state.origin).host : ''}</small>
      </div>
      <div className="composer-title">
        <h1>{t('新建批注', 'New annotation')}</h1>
        <div className="selection-actions">
          <span id="selection-count" role="status">
            {state.selections.length
              ? t(
                  `已选 ${state.selections.length} / 10 个元素`,
                  `${state.selections.length} / 10 selected`,
                )
              : t('选取 → 描述 → 提交', 'Select → Describe → Submit')}
          </span>
          {state.selections.length ? (
            <AsyncButton
              id="clear-selected"
              className="quiet clear-selected"
              aria-label={t('全部清空已选元素', 'Clear all selected elements')}
              isDisabled={state.submitting}
              run={() => controller.clearSelected()}
            >
              {t('全部清空', 'Clear all')}
            </AsyncButton>
          ) : null}
        </div>
      </div>
      <Card
        className={`compose-box ${state.selections.length ? 'has-selections' : ''}`}
        onCompositionStart={() => {
          composing.current = true;
        }}
        onCompositionEnd={() => {
          composing.current = false;
        }}
        onKeyDown={(event: ReactKeyboardEvent<HTMLDivElement>) => {
          if (
            !(event.target instanceof HTMLTextAreaElement) ||
            event.key !== 'Enter' ||
            event.shiftKey ||
            event.ctrlKey ||
            event.metaKey ||
            event.altKey ||
            event.nativeEvent.isComposing ||
            composing.current ||
            event.keyCode === 229
          )
            return;
          event.preventDefault();
          if (!event.repeat && canSubmit) void controller.submit();
        }}
      >
        <div className={`target ${state.selections.length ? '' : 'empty'}`} id="selected">
          {state.selections.map((item, index) => (
            <Card className="selected-entry" key={`${item.url}:${item.selector}`}>
              <div className="selected-row">
                <AsyncButton
                  className="quiet selected-locate"
                  aria-label={t(
                    `定位 ${item.label || item.tag}`,
                    `Locate ${item.label || item.tag}`,
                  )}
                  title={item.label || item.tag}
                  run={() => controller.locate(item)}
                >
                  <span className="selection-number" aria-hidden="true">
                    {index + 1}
                  </span>
                  <span className="selection-type">{t(...elementType(item))}</span>
                  <strong>{shortLabel(item)}</strong>
                </AsyncButton>
                <ElementDetails item={item} />
                <Button
                  className="quiet icon-button"
                  aria-label={t(
                    `移除 ${item.label || item.tag}`,
                    `Remove ${item.label || item.tag}`,
                  )}
                  onPress={() => controller.remove(item.selector)}
                >
                  <Icon name="close" />
                </Button>
              </div>
              <TextArea
                className="element-description"
                aria-label={t(
                  `${item.label || item.tag}的修改描述`,
                  `Changes for ${item.label || item.tag}`,
                )}
                placeholder={t('这个元素怎么改…', 'How should this element change?')}
                maxLength={2000}
                rows={1}
                value={item.description || ''}
                onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
                  controller.describe(item.selector, event.target.value)
                }
              />
            </Card>
          ))}
        </div>
        <div className="composer-inputs">
          <TextArea
            id="instruction"
            aria-label={t('修改意见', 'Change request')}
            maxLength={8000}
            rows={state.selections.length ? 1 : 2}
            placeholder={
              state.selections.length
                ? t('补充整体要求（可选）…', 'Overall instructions (optional)…')
                : t('你想如何修改这个页面？', 'What would you like to change?')
            }
            value={state.draft}
            onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
              controller.setDraft(event.target.value)
            }
          />
        </div>
        <div className="compose-tools">
          <AsyncButton
            id="pick"
            className="pick-button"
            aria-label={
              state.pickerActive
                ? t('结束选取', 'Stop selecting')
                : t('选取元素', 'Select elements')
            }
            aria-pressed={state.pickerActive}
            title={
              state.pickerActive
                ? t('再次点击或按 Esc 结束选取', 'Click again or press Esc to stop selecting')
                : t('选取网页元素', 'Select page elements')
            }
            run={() => controller.pick()}
          >
            <span className="picker-indicator" aria-hidden="true">
              <Icon name="pick" />
            </span>
            {state.pickerActive ? t('选取中', 'Selecting') : t('选取元素', 'Select')}
          </AsyncButton>
          <ExecutionSettings state={state} />
          <Button
            id="submit"
            className="primary send"
            isDisabled={!canSubmit}
            isPending={state.submitting}
            aria-label={t('提交修改', 'Submit annotation')}
            onPress={() => {
              void controller.submit();
            }}
          >
            {state.submitting ? t('提交中', 'Sending') : t('提交', 'Submit')}
            <Icon name="send" />
          </Button>
        </div>
      </Card>
      <NoticeBox notice={state.notice} id="notice" />
    </section>
  );
}
function cliMessage(code: string, t: Translator) {
  const messages: Record<string, [string, string]> = {
    CLI_STARTING: ['正在启动 CLI', 'Starting CLI'],
    CLI_STARTED: ['已启动 CLI', 'CLI started'],
    CLI_ACTIVITY_TRUNCATED: [
      '执行记录已达上限，后续记录未保存。',
      'Activity limit reached; further records were not saved.',
    ],
    CLI_TOOL_STARTED: ['CLI 正在处理', 'CLI is working'],
    CLI_NOT_FOUND: ['未检测到 CLI，请先安装并登录。', 'CLI not found. Install and sign in first.'],
    CLI_PERMISSION_DENIED: [
      'CLI 拒绝了权限请求，请在该 CLI 中配置权限后重新提交。',
      'CLI denied permission. Configure permissions in that CLI before submitting again.',
    ],
    CLI_REPORTED_ERROR: [
      'CLI 返回错误，请检查该 CLI 的登录、模型和权限设置。',
      'CLI reported an error. Check its login, model and permissions.',
    ],
    CLI_AUTH_REQUIRED: [
      'CLI 认证失败，请先在对应 CLI 完成登录；具体原因见执行记录。',
      'CLI authentication failed. Sign in to the corresponding CLI; see Activity for details.',
    ],
    CLI_MODEL_UNAVAILABLE: [
      '模型不可用，请检查该 CLI 的默认模型和供应商配置；具体原因见执行记录。',
      'Model unavailable. Check the CLI default model and provider; see Activity for details.',
    ],
    CLI_USAGE_ERROR: [
      'CLI 参数或输入不兼容，具体原因见执行记录。',
      'CLI argument or input mismatch. See Activity for details.',
    ],
    CLI_EXIT_FAILED: [
      'CLI 异常退出，请在终端检查其登录和配置。',
      'CLI exited unsuccessfully. Check its login and configuration in a terminal.',
    ],
    CLI_TIMEOUT: [
      '执行超时，已停止。请检查代码后再提交。',
      'Execution timed out and was stopped. Check changes before resubmitting.',
    ],
    CLI_NO_RESULT: [
      'CLI 未返回完整结果，请检查代码后再提交。',
      'CLI returned no complete result. Check changes before resubmitting.',
    ],
    CLI_PROJECT_MOVED: [
      '项目目录已变化，请重新绑定项目。',
      'The project directory changed. Link it again.',
    ],
    CLI_OUTPUT_LIMIT: [
      'CLI 输出超出限制，已停止。',
      'CLI output exceeded the limit; execution stopped.',
    ],
    CLI_START_FAILED: [
      '无法启动 CLI，请检查本机安装。',
      'Could not start CLI. Check its installation.',
    ],
    CLI_SERVICE_STOPPED: ['本地服务停止，任务已中断。', 'Local service stopped; task interrupted.'],
  };
  const message = messages[code];
  if (message) return t(...message);
  return code.replace(
    /^(command|tool|files|web_search|process_exit) · (running|completed|failed|error|in_progress|reported|declined|exit=\d+|signal)/,
    (_match, kind: string, status: string) => {
      const kinds: Record<string, string> = {
        command: t('命令', 'Command'),
        tool: t('工具', 'Tool'),
        files: t('文件修改', 'Files'),
        web_search: t('网页搜索', 'Web search'),
        process_exit: t('进程结束', 'Process exited'),
      };
      const statuses: Record<string, string> = {
        running: t('执行中', 'Running'),
        in_progress: t('执行中', 'Running'),
        completed: t('已完成', 'Completed'),
        failed: t('失败', 'Failed'),
        error: t('失败', 'Failed'),
        reported: t('已回传', 'Reported'),
        declined: t('已拒绝', 'Declined'),
        signal: t('信号终止', 'Terminated by signal'),
      };
      return `${kinds[kind]} · ${statuses[status] || status}`;
    },
  );
}
const JobCard = memo(function JobCard({
  job,
  projectName,
  language,
}: {
  job: Job;
  projectName: string;
  language: Preferences['language'];
}) {
  const t = useContext(Locale);
  const names = {
    queued: job.executor === 'mcp' ? t('待领取', 'Awaiting claim') : t('排队中', 'Queued'),
    running: t('执行中', 'Running'),
    waiting: t('待确认', 'Awaiting approval'),
    completed: t('已完成', 'Completed'),
    failed: t('执行失败', 'Failed'),
    cancelled: t('已取消', 'Cancelled'),
    interrupted: t('已中断', 'Interrupted'),
  };
  const described = job.selections?.filter((s) => s.description?.trim()) || [];
  const duration = formatTaskDuration(job, language);
  return (
    <Card className="job" data-status={job.status} data-executor={job.executor || 'codex'}>
      <div className="job-head">
        <strong>
          {job.selection.label || job.selection.tag}
          {(job.selections?.length || 0) > 1
            ? t(` 等 ${job.selections!.length} 个元素`, ` + ${job.selections!.length - 1} elements`)
            : ''}
        </strong>
        <span className={`pill status-${job.status}`}>{names[job.status]}</span>
      </div>
      <p className="job-instruction">{job.instruction}</p>
      <div className="job-meta">
        <span className="executor-badge">
          {job.delivery && job.delivery.target !== 'mcp'
            ? `${executorName(job.delivery.target)}${job.executor === 'mcp' ? ' · MCP' : ''}`
            : job.executor === 'mcp'
              ? `${job.recipient?.name || 'MCP'}${job.recipient ? ' · MCP' : ''}`
              : executorName(job.executor)}
        </span>
        <span>
          {projectName} ·{' '}
          {new Date(job.createdAt).toLocaleString(language, {
            month: 'numeric',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </span>
      </div>
      {job.executor === 'mcp' && !terminal(job.status) ? (
        <small className="job-agent">
          {t(
            '旧版批注。取消后可通过 CLI 重新提交。',
            'Legacy annotation. Cancel and submit again through CLI.',
          )}
        </small>
      ) : null}
      {job.delivery?.detail ? (
        <div className="delivery-status">
          <small className="muted">{t('历史交付信息', 'Historical delivery information')}</small>
          <small className="muted">{job.delivery.detail}</small>
        </div>
      ) : null}
      {job.executor === 'mcp' && job.agent ? (
        <small className="job-agent">
          {job.agent || t('等待 Agent 领取', 'Waiting for an agent')} · {t('通过 MCP', 'via MCP')}
        </small>
      ) : null}
      {job.error ? (
        <div className="job-error">
          <b>
            {job.executor === 'opencode'
              ? t('OpenCode 未完成此任务', 'OpenCode did not complete this task')
              : t('此任务未完成', 'This task was not completed')}
          </b>
          <Fold title={t('错误详情', 'Error details')} open>
            <pre>{cliMessage(job.error, t)}</pre>
          </Fold>
        </div>
      ) : null}
      {described.length || job.events.length || job.result ? (
        <div className="job-details">
          {described.length ? (
            <Fold title={t('元素描述', 'Element notes')} count={described.length}>
              {described.map((s) => (
                <div className="job-element-note" key={s.selector}>
                  <strong>{s.label || s.tag}</strong>
                  <p>{s.description}</p>
                </div>
              ))}
            </Fold>
          ) : null}
          {job.events.length ? (
            <Fold
              className="job-activity"
              title={t('执行记录', 'Activity')}
              count={job.events.length}
            >
              <pre>
                {job.events
                  .map(
                    (e) =>
                      `${new Date(e.at).toLocaleTimeString(language)}  ${cliMessage(e.text, t)}`,
                  )
                  .join('\n')}
              </pre>
            </Fold>
          ) : null}
          {job.result ? (
            <Fold
              className="job-result"
              title={t('修改结果', 'Result')}
              detail={duration ? t(`总耗时 ${duration}`, `Total ${duration}`) : undefined}
            >
              <pre>{job.result}</pre>
            </Fold>
          ) : null}
        </div>
      ) : null}
      {job.commit?.status === 'committed' ? (
        <small>
          {t('已 Commit', 'Committed')} · {job.commit.hash?.slice(0, 8)}
          <br />
          {job.commit.message?.split('\n')[0]}
        </small>
      ) : null}
      <div className="job-actions">
        {terminal(job.status) ? (
          <>
            <AsyncButton className="quiet" run={() => controller.restore(job)}>
              {t('继续修改', 'Continue editing')}
            </AsyncButton>
          </>
        ) : (
          <AsyncButton className="quiet" run={() => controller.cancel(job)}>
            {job.executor === 'mcp'
              ? t('取消批注', 'Cancel annotation')
              : t('停止任务', 'Stop task')}
          </AsyncButton>
        )}
      </div>
    </Card>
  );
});
function VersionFooter() {
  const t = useContext(Locale);
  const current = chrome.runtime.getManifest().version;
  const [result, setResult] = useState<{
    status: 'idle' | 'checking' | 'current' | 'available' | 'ahead' | 'error';
    latest?: string;
  }>({ status: 'idle' });
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  const status =
    result.status === 'checking'
      ? t('检查中…', 'Checking…')
      : result.status === 'current'
        ? t('已是最新', 'Up to date')
        : result.status === 'available'
          ? t(`发现 v${result.latest}`, `v${result.latest} available`)
          : result.status === 'ahead'
            ? t('当前版本较新', 'Newer than latest release')
            : result.status === 'error'
              ? t('检查失败，重试', 'Check failed. Retry')
              : t('检查更新', 'Check for updates');
  return (
    <footer className="settings-version">
      <div className="version-row">
        <span className="version-number">v{current}</span>
        <AsyncButton
          id="version-check"
          className="quiet version-check"
          aria-label={t('检查 PointDOM 更新', 'Check PointDOM updates')}
          run={async () => {
            const abort = new AbortController();
            request.current = abort;
            setResult({ status: 'checking' });
            try {
              const next = await checkLatestRelease(current, abort.signal);
              if (!abort.signal.aborted) setResult(next);
            } catch {
              if (!abort.signal.aborted) setResult({ status: 'error' });
            } finally {
              request.current = null;
            }
          }}
        >
          <span role="status" aria-live="polite">
            {status}
          </span>
        </AsyncButton>
      </div>
      {result.status === 'available' ? (
        <small>
          {t('运行', 'Run')} <code>pdo upgrade</code>
          {t('，然后重新加载扩展。', ', then reload the extension.')}
        </small>
      ) : null}
    </footer>
  );
}
function ConnectionSettings({ state, locked = false }: { state: PanelState; locked?: boolean }) {
  const t = useContext(Locale);
  const [code, setCode] = useState('');
  const [changingCode, setChangingCode] = useState(false);
  const showPairingForm = !state.pairingSaved || changingCode;
  const [installCopyError, setInstallCopyError] = useState(false);
  const matching = state.projects.filter((p) => p.origins.includes(state.origin));
  const sites = linkedSites(state.projects);
  const [siteChoice, setSiteChoice] = useState('');
  const accessOrigin = sites.some((site) => site.id === siteChoice)
    ? siteChoice
    : sites.length === 1
      ? sites[0]!.id
      : '';
  const needsSiteChoice = !state.origin || !matching.length;
  const selectedOrigin = needsSiteChoice ? accessOrigin : state.origin;
  const selectedProjects = state.projects.filter((project) =>
    project.origins.includes(selectedOrigin),
  );
  const accessEnabled = selectedOrigin ? state.siteAccess[selectedOrigin] : false;
  const enablingAccess = state.enablingOrigin === selectedOrigin && Boolean(selectedOrigin);
  return (
    <section
      id="connection-view"
      hidden={!state.settings}
      aria-label={t('连接与设置', 'Connection settings')}
    >
      <div className="section-title">
        <div>
          <h2>{t('连接与设置', 'Connection settings')}</h2>
        </div>
        <Button
          id="close-connection"
          hidden={locked}
          className="quiet"
          onPress={() => controller.setSettings(false)}
        >
          <Icon name="back" />
          {t('返回批注', 'Back to annotations')}
        </Button>
      </div>
      <Card className="shortcut-settings">
        <div className="section-title">
          <h2>{t('快捷键', 'Keyboard shortcuts')}</h2>
          <AsyncButton
            id="edit-shortcuts"
            className="quiet"
            run={() => chrome.tabs.create({ url: 'chrome://extensions/shortcuts' })}
          >
            {t('修改快捷键 ↗', 'Edit shortcuts ↗')}
          </AsyncButton>
        </div>
        <div className="shortcut-row">
          <span>{t('选取元素', 'Select elements')}</span>
          <kbd id="shortcut-pick">{state.shortcuts.pick || t('未设置', 'Not set')}</kbd>
        </div>
        <div className="shortcut-row">
          <span>{t('打开 / 关闭侧栏', 'Toggle side panel')}</span>
          <kbd id="shortcut-panel">{state.shortcuts.panel || t('未设置', 'Not set')}</kbd>
        </div>
        <small>
          {t(
            '再次按选取快捷键退出，也可按 Esc。修改按键后返回自动更新。',
            'Press the selection shortcut again or Esc to exit. Changes refresh when you return.',
          )}
        </small>
      </Card>
      <Card className="pairing-settings">
        <div className="section-title">
          <h2>{t('连接 PointDOM', 'Connect PointDOM')}</h2>
          {state.pairingSaved ? (
            <span id="pairing-status" className="pill">
              {t('已添加', 'Added')}
            </span>
          ) : null}
        </div>
        {state.connection !== 'connected' ? (
          <div className="local-install-guide">
            <p id="local-service-status" role="status">
              {state.bootstrap === 'waiting'
                ? t(
                    '等待安装完成，连接后自动继续。',
                    'Waiting for installation. Connection continues automatically.',
                  )
                : state.bootstrap === 'available'
                  ? t(
                      '已检测到本地服务，运行命令授权此扩展。',
                      'Local service detected. Run the command to authorize this extension.',
                    )
                  : t('本地服务未连接。', 'Local service not connected.')}
            </p>
            <AsyncButton
              id="copy-local-install"
              className="primary"
              isDisabled={!state.installPlatform}
              run={async () => {
                setInstallCopyError(false);
                try {
                  await controller.copyInstallCommand();
                } catch {
                  setInstallCopyError(true);
                }
              }}
            >
              {state.bootstrap === 'waiting'
                ? t('重新复制安装命令', 'Copy install command again')
                : t('复制安装命令', 'Copy install command')}
            </AsyncButton>
            <small>
              {state.installPlatform === 'win'
                ? t(
                    '在 PowerShell 粘贴并运行，完成后返回这里。',
                    'Paste and run in PowerShell, then return here.',
                  )
                : state.installPlatform === 'mac'
                  ? t(
                      '在终端粘贴并运行，完成后返回这里。',
                      'Paste and run in Terminal, then return here.',
                    )
                  : state.ready
                    ? t(
                        '当前环境暂不支持一键安装，可使用下方手动配对。',
                        'One-command installation is unavailable here. Use manual pairing below.',
                      )
                    : t('正在识别系统…', 'Detecting your system…')}
            </small>
            <small className="muted">
              {t(
                '已有安装会复用，保留项目与历史记录。',
                'Existing installations, projects and history are preserved.',
              )}
            </small>
            {installCopyError ? (
              <small role="alert">{t('复制失败，请重试。', 'Copy failed. Try again.')}</small>
            ) : null}
          </div>
        ) : null}
        <Fold
          key={state.pairingSaved ? 'saved' : 'manual'}
          title={t('高级：手动配对', 'Advanced: manual pairing')}
          open={state.pairingSaved}
        >
          {showPairingForm ? (
            <>
              <p className="muted">
                {t(
                  '粘贴 pdo setup 或 pdo pair 显示的配对码。连接后自动保存，无需重复添加。',
                  'Paste the code from pdo setup or pdo pair. It is saved locally after connecting.',
                )}
              </p>
              <Label htmlFor="token">{t('配对码', 'Pairing code')}</Label>
              <Input
                id="token"
                type="password"
                autoComplete="off"
                spellCheck={false}
                placeholder={t('粘贴本机配对码', 'Paste this computer’s pairing code')}
                value={code}
                onChange={(event: ChangeEvent<HTMLInputElement>) => setCode(event.target.value)}
              />
              <div className="pairing-actions">
                <AsyncButton
                  id="connect"
                  className="primary"
                  isDisabled={!code.trim() || state.connection === 'connecting'}
                  run={async () => {
                    if (await controller.connect(code)) {
                      setCode('');
                      setChangingCode(false);
                    }
                  }}
                >
                  {t('连接', 'Connect')}
                </AsyncButton>
                {state.pairingSaved ? (
                  <Button
                    id="cancel-pairing"
                    className="quiet"
                    onPress={() => {
                      setCode('');
                      setChangingCode(false);
                      controller.clearNotice();
                    }}
                  >
                    {t('取消', 'Cancel')}
                  </Button>
                ) : null}
              </div>
            </>
          ) : (
            <>
              <p className="muted">
                {t(
                  '配对码已保存在本机，无需重复添加。',
                  'The pairing code is saved on this computer. No need to add it again.',
                )}
              </p>
              <small id="pairing-connection">
                {state.connection === 'connected'
                  ? t('本地服务已连接', 'Local service connected')
                  : state.connection === 'connecting'
                    ? t('正在连接本地服务…', 'Connecting to the local service…')
                    : t(
                        '本地服务未连接，请确认服务已启动。',
                        'Local service offline. Make sure it is running.',
                      )}
              </small>
              <div className="pairing-actions">
                <Button id="change-pairing" className="quiet" onPress={() => setChangingCode(true)}>
                  {t('更换配对码', 'Change pairing code')}
                </Button>
                {state.connection === 'offline' ? (
                  <AsyncButton id="reconnect" className="quiet" run={() => controller.connect()}>
                    {t('重新连接', 'Reconnect')}
                  </AsyncButton>
                ) : null}
              </div>
            </>
          )}
        </Fold>
      </Card>
      <div id="project-field" hidden={matching.length <= 1}>
        <FieldSelect
          id="project"
          label={t('代码项目', 'Code project')}
          value={state.projectId}
          items={[
            {
              id: '',
              name: t('选择项目', 'Choose a project'),
            },
            ...matching.map((p) => ({ id: p.id, name: p.name })),
          ]}
          onChange={(value) => controller.setProject(value)}
        />
      </div>
      <Card className="site-access-settings">
        <h2>{t('项目网页访问', 'Project page access')}</h2>
        {state.connection !== 'connected' ? (
          <p className="muted">
            {t('先在上方连接本地服务。', 'Connect the local service above first.')}
          </p>
        ) : !sites.length ? (
          <div className="project-link-guide">
            <p className="muted">
              {t(
                '尚未关联项目。在代码项目目录中运行：',
                'No projects linked. Run in your source project directory:',
              )}
            </p>
            <code>pdo link --origin http://localhost:3000</code>
            <small>
              {t(
                '将网址替换为实际开发地址，关联后在此启用访问。',
                'Use your development URL, then enable access here.',
              )}
            </small>
          </div>
        ) : (
          <>
            {needsSiteChoice ? (
              <FieldSelect
                id="site-origin"
                label={t('已关联的项目网址', 'Linked project URL')}
                value={accessOrigin}
                items={[{ id: '', name: t('选择项目网址', 'Choose a project URL') }, ...sites]}
                onChange={setSiteChoice}
              />
            ) : null}
            <div className="site-access-row">
              <div className="site-access-info">
                <strong>
                  {selectedProjects.length
                    ? selectedProjects.map((project) => project.name).join(' / ')
                    : t('选择项目网址', 'Choose a project URL')}
                </strong>
                <small>
                  {selectedOrigin ||
                    t('选择上方已关联的项目网址', 'Choose a linked project URL above')}
                </small>
              </div>
              {!state.origin || matching.length ? (
                <AsyncButton
                  id="enable-page"
                  className={accessEnabled ? 'quiet site-access-enabled' : 'primary'}
                  isDisabled={
                    !selectedOrigin || accessEnabled !== false || Boolean(state.enablingOrigin)
                  }
                  run={() =>
                    controller.enablePage(
                      accessOrigin,
                      new URLSearchParams(location.search).has('settings'),
                    )
                  }
                >
                  {enablingAccess ? (
                    t('启用中…', 'Enabling…')
                  ) : accessEnabled ? (
                    <>
                      <Icon name="check" />
                      {t('已启用', 'Enabled')}
                    </>
                  ) : selectedOrigin && accessEnabled === undefined ? (
                    t('检查中…', 'Checking…')
                  ) : (
                    t('启用访问', 'Enable access')
                  )}
                </AsyncButton>
              ) : null}
            </div>
            {needsSiteChoice ? (
              <AsyncButton
                id="open-project-site"
                className="quiet"
                isDisabled={!accessOrigin}
                run={() => controller.openProjectSite(accessOrigin)}
              >
                {t('打开项目网页 ↗', 'Open project page ↗')}
              </AsyncButton>
            ) : null}
          </>
        )}
      </Card>
      <AsyncButton id="copy-context" className="quiet" run={() => controller.copyContext()}>
        {t('复制 DOM 与修改描述', 'Copy DOM and change descriptions')}
      </AsyncButton>
      <NoticeBox notice={state.notice} id="settings-notice" />
      <VersionFooter />
    </section>
  );
}
function Panel() {
  const state = useSyncExternalStore(controller.subscribe, controller.snapshot);
  const [filter, setFilter] = useState<'all' | 'active'>('all');
  const { preferences } = state;
  const t = translators[preferences.language];
  const settingsOnly = new URLSearchParams(location.search).has('settings');
  const showWorkspace =
    !settingsOnly && state.projects.some((project) => project.origins.includes(state.origin));
  useEffect(() => {
    void controller.start();
    return () => controller.stop();
  }, []);
  useLayoutEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      document.documentElement.dataset.mode =
        preferences.mode === 'system' ? (media.matches ? 'dark' : 'light') : preferences.mode;
    };
    document.documentElement.dataset.accent = preferences.accent;
    document.documentElement.dataset.shape = preferences.shape;
    document.documentElement.lang = preferences.language;
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [preferences]);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (
        event.key === 'Escape' &&
        !event.isComposing &&
        !document.querySelector(
          '[data-overlay-container] [role="dialog"], [role="listbox"], [role="menu"]',
        )
      )
        void controller.stopPicker();
    };
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, []);
  const projectJobs = state.jobs.filter((job) => job.projectId === state.projectId);
  const active = projectJobs.filter((job) => !terminal(job.status));
  const jobs = filter === 'all' ? projectJobs : active;
  const connectionLabel =
    state.connection === 'connected'
      ? t('已连接', 'Connected')
      : state.connection === 'connecting'
        ? t('连接中', 'Connecting')
        : t('未连接', 'Offline');
  return (
    <I18nProvider locale={preferences.language}>
      <Locale value={t}>
        <header className="app-header">
          <div className="brand">
            <svg className="brand-mark" role="img" aria-label="PointDOM" viewBox="0 0 32 32">
              <path d={logoFrame} />
              <circle {...logoDot} className="brand-point" />
            </svg>
            <span
              id="connection"
              role="status"
              data-state={state.connection}
              title={`${connectionLabel} · ${t('本地服务', 'Local service')}`}
            >
              {connectionLabel}
            </span>
          </div>
          <div className="header-tools">
            <HeaderPreferences preferences={preferences} />
            <Button
              id="connection-settings"
              hidden={!showWorkspace}
              className="quiet icon-button"
              aria-label={
                state.settings ? t('关闭设置', 'Close settings') : t('打开设置', 'Open settings')
              }
              title={
                state.settings ? t('关闭设置', 'Close settings') : t('打开设置', 'Open settings')
              }
              aria-expanded={state.settings}
              aria-controls="connection-view"
              onPress={() => controller.setSettings(!state.settings)}
            >
              <span
                key={state.settings ? 'open' : 'closed'}
                className={`settings-glyph settings-glyph--${state.settings ? 'open' : 'closed'}`}
              >
                <Icon name={state.settings ? 'close' : 'settings'} />
              </span>
            </Button>
          </div>
        </header>
        <main className="panel-layout">
          {showWorkspace ? (
            <>
              <Composer state={state} />
              <nav className="record-tabs" aria-label={t('记录筛选', 'Filter annotations')}>
                <Button
                  id="tab-all"
                  aria-pressed={filter === 'all'}
                  onPress={() => setFilter('all')}
                >
                  {t('全部批注', 'All')}
                  <span id="job-count">{projectJobs.length}</span>
                </Button>
                <Button
                  id="tab-active"
                  className={active.length ? 'has-active-jobs' : ''}
                  aria-pressed={filter === 'active'}
                  onPress={() => setFilter('active')}
                >
                  {t('进行中', 'Active')}
                  <span id="active-count">{active.length}</span>
                </Button>
                <AsyncButton
                  id="refresh"
                  className="quiet icon-button"
                  aria-label={t('刷新记录', 'Refresh annotations')}
                  run={() => controller.refresh()}
                >
                  <Icon name="refresh" />
                </AsyncButton>
              </nav>
              <section className="record-scroll" aria-label={t('修改记录', 'Annotation history')}>
                <div id="jobs" className="stack">
                  {jobs.length ? (
                    jobs.map((job) => (
                      <JobCard
                        key={job.id}
                        job={job}
                        projectName={
                          state.projects.find((p) => p.id === job.projectId)?.name ||
                          t('项目', 'Project')
                        }
                        language={preferences.language}
                      />
                    ))
                  ) : (
                    <div className="empty">
                      <b>
                        {filter === 'all'
                          ? t('从一个想改的地方开始', 'Start with something you want to change')
                          : t('暂无进行中的修改', 'No active annotations')}
                      </b>
                      <p>
                        {t(
                          '选取网页元素并描述修改，也可以直接描述整个页面。',
                          'Select an element and describe the change, or describe the whole page.',
                        )}
                      </p>
                    </div>
                  )}
                </div>
              </section>
            </>
          ) : null}
          <ConnectionSettings
            state={showWorkspace ? state : { ...state, settings: true }}
            locked={!showWorkspace}
          />
        </main>
      </Locale>
    </I18nProvider>
  );
}
const root = document.getElementById('root');
if (!root) throw new Error('Missing PointDOM root');
createRoot(root).render(<Panel />);
