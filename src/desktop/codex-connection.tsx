import { useEffect, useRef, useState } from 'react';
import { Button } from '@heroui/react/button';
import { native } from './native-api.js';

export function CodexConnection({
  projectId,
  t,
  onConnected,
}: {
  projectId: string;
  t: (zh: string, en: string) => string;
  onConnected: (reloaded: boolean) => void;
}) {
  const [items, setItems] = useState<{ id: string; title: string }[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState(false);
  const generation = useRef(0);
  const load = async (next?: string) => {
    const version = ++generation.current;
    setLoading(true);
    setError(false);
    try {
      const result = await native.codexConversations(projectId, next);
      if (version !== generation.current) return;
      setItems((previous) => [
        ...new Map(
          (next ? [...previous, ...result.conversations] : result.conversations).map((item) => [
            item.id,
            item,
          ]),
        ).values(),
      ]);
      setCursor(result.nextCursor);
    } catch {
      if (version === generation.current) setError(true);
    } finally {
      if (version === generation.current) setLoading(false);
    }
  };
  useEffect(() => {
    void load();
    return () => {
      generation.current++;
    };
  }, [projectId]);
  return (
    <section
      className="codex-connections"
      aria-label={t('连接 Codex 对话', 'Connect Codex conversation')}
    >
      <h3>{t('选择 Codex 对话', 'Choose a Codex conversation')}</h3>
      <p>
        {t(
          '只显示属于此源码项目的对话，授权后插件会使用你的选择。',
          'Only conversations for this source project appear. Authorization also selects the recipient in the extension.',
        )}
      </p>
      {loading ? <p role="status">{t('正在读取对话…', 'Loading conversations…')}</p> : null}
      {error ? (
        <p role="alert">
          {t(
            '无法读取或连接对话。请确认 Codex 已安装、对话属于此项目，然后重试。',
            'Could not read or connect the conversation. Check that Codex is installed and the conversation belongs to this project, then retry.',
          )}
        </p>
      ) : null}
      {!loading && !error && !items.length ? (
        <p>
          {t(
            '此页暂无匹配对话。可加载更多，或先在 Codex 中打开这个源码项目并新建对话。',
            'No matching conversations on this page. Load more, or open this source project in Codex and create a conversation.',
          )}
        </p>
      ) : null}
      <ul>
        {items.map((item) => (
          <li key={item.id}>
            <Button
              variant="secondary"
              isDisabled={connecting || loading}
              onPress={() => {
                setConnecting(true);
                setError(false);
                void native
                  .authorizeCodex(projectId, item.id)
                  .then((result) => {
                    if (result) onConnected(result.mcpReloaded);
                  })
                  .catch(() => setError(true))
                  .finally(() => setConnecting(false));
              }}
            >
              <span>{item.title}</span>
              <small>{item.id.slice(0, 8)}</small>
              <span>{t('授权连接', 'Authorize')}</span>
            </Button>
          </li>
        ))}
      </ul>
      <Button variant="tertiary" isDisabled={loading || connecting} onPress={() => void load()}>
        {t('刷新对话', 'Refresh')}
      </Button>
      {cursor ? (
        <Button
          variant="tertiary"
          isDisabled={loading || connecting}
          onPress={() => void load(cursor)}
        >
          {t('加载更多', 'Load more')}
        </Button>
      ) : null}
    </section>
  );
}
