import { test, expect } from '@playwright/test';
import { nativeFixture } from '../fixtures/native.js';
import { randomUUID } from 'node:crypto';

test('recipient menu separates idle transports from authorized conversations without changing recipients', async () => {
  const fixture = await nativeFixture('<!doctype html><h1>Recipient menu fixture</h1>');
  try {
    const { context, project } = fixture;
    const worker = context.serviceWorkers()[0] || (await context.waitForEvent('serviceworker'));
    const id = new URL(worker.url()).host;
    const idle = randomUUID();
    const ready = randomUUID();
    let phase = 'one-ready';
    let revision = randomUUID();
    const page = await context.newPage();
    await page.goto(fixture.origin);
    const panel = await context.newPage();
    panel.setDefaultTimeout(5000);
    await worker.evaluate(
      ({ projectId, idle }) =>
        chrome.storage.local.set({ pointdomRecipients: { [projectId]: idle } }),
      { projectId: project.id, idle },
    );
    await panel.addInitScript(() => {
      window.open = (url) => {
        document.documentElement.dataset.handoff = String(url);
        return window;
      };
    });
    await panel.route('**/api/agents?*', (route) =>
      route.fulfill({
        json: {
          agents: [idle, ready].map((agentId) => ({
            id: agentId,
            projectId: project.id,
            name: 'codex-mcp-client',
            version: '1',
            connectedAt: new Date().toISOString(),
            lastSeenAt: new Date().toISOString(),
            connected: true,
            listening: false,
            wakeable:
              phase === 'two-ready' ||
              phase === 'native-choice' ||
              (phase === 'one-ready' && agentId === ready),
            ...(phase === 'native-choice' && agentId === ready
              ? { selectionRevision: revision, conversationTitle: 'Chosen conversation' }
              : {}),
          })),
        },
      }),
    );
    await panel.goto(`chrome-extension://${id}/panel.html`);
    await panel.getByRole('button', { name: '高级：手动配对', exact: true }).click();
    await panel.locator('#token').fill(fixture.token);
    await panel.locator('#connect').click();
    await page.bringToFront();
    await expect(panel.locator('#execution-summary')).toHaveText('选择对话');
    for (const width of [380, 320, 280]) {
      await panel.setViewportSize({ width, height: 900 });
      await panel.locator('#execution-settings').click();
      const menu = panel.locator('.execution-popover');
      await expect(menu).not.toHaveAttribute('data-entering', 'true');
      await expect(menu).toHaveCSS('opacity', '1');
      await expect(menu.locator('.client-select')).toHaveCount(1);
      await expect(menu.locator('.client-name')).toHaveText('Codex');
      await expect(menu.locator('.client-status')).toHaveText('有批注时自动唤醒');
      expect(
        await menu.evaluate((element) => {
          const bounds = element.getBoundingClientRect();
          return (
            element.scrollWidth <= element.clientWidth &&
            bounds.left >= 0 &&
            bounds.right <= innerWidth
          );
        }),
      ).toBe(true);
      expect(
        await menu
          .locator('.client-select')
          .evaluate((element) => element.scrollWidth <= element.clientWidth),
      ).toBe(true);
      await panel.screenshot({
        path: test.info().outputPath(`recipient-menu-${width}.png`),
        animations: 'disabled',
      });
      await panel.keyboard.press('Escape');
      await expect(menu).toBeHidden();
    }
    // Restore a normal side-panel width before the recipient switching checks.
    await panel.setViewportSize({ width: 380, height: 900 });
    expect(
      await worker.evaluate(
        async (projectId) =>
          (
            (await chrome.storage.local.get('pointdomRecipients')).pointdomRecipients as Record<
              string,
              string
            >
          )[projectId],
        project.id,
      ),
    ).toBe(idle);
    await panel.locator('#execution-settings').click();
    await panel.locator('.execution-popover .client-select').click();
    await expect(panel.locator('#execution-summary')).toHaveText('Codex');
    phase = 'two-ready';
    await panel.reload();
    await panel.locator('#execution-settings').click();
    await expect(panel.locator('.execution-popover .client-select')).toHaveCount(2);
    await expect(panel.locator('.execution-popover .client-name')).toHaveText([
      `Codex · ${idle.slice(0, 6)}`,
      `Codex · ${ready.slice(0, 6)}`,
    ]);
    await panel.keyboard.press('Escape');
    phase = 'none-ready';
    await panel.reload();
    await expect(
      panel.getByRole('heading', { name: '连接 Codex 对话', exact: true }),
    ).toBeVisible();
    await panel.getByRole('button', { name: '选择 Codex 对话', exact: true }).click();
    await expect(panel.locator('html')).toHaveAttribute(
      'data-handoff',
      `pointdom://conversation?projectId=${project.id}`,
    );
    phase = 'native-choice';
    await panel.reload();
    await expect(panel.locator('#execution-summary')).toHaveText('Chosen conversation');
    await panel.locator('#execution-settings').click();
    await panel.locator('.execution-popover .client-select').first().click();
    await expect(panel.locator('#execution-summary')).toHaveText('Codex');
    await panel.reload();
    await expect(panel.locator('#execution-summary')).toHaveText('Codex');
    revision = randomUUID();
    await panel.reload();
    await expect(panel.locator('#execution-summary')).toHaveText('Chosen conversation');
    expect(fixture.jobs()).toHaveLength(0);
  } finally {
    await fixture.close();
  }
});
