import uiTheme from '../shared/ui-theme.json' with { type: 'json' };

export { uiTheme };

/** Semantic roles shared by the desktop and extension in both appearances. */
export function themeStyles(): string {
  const variables = (colors: Record<string, string>) =>
    Object.entries(colors)
      .map(([name, value]) => `--ui-${name}: ${value};`)
      .join('\n');
  return `:root {\n${variables(uiTheme.brand)}\n${variables(uiTheme.dark)}\n}\n:root[data-mode='light'], :root[data-theme='light'] {\n${variables(uiTheme.light)}\n}\n`;
}

export const brandAccent = uiTheme.brand.accent;
export const palettes = {
  // Retain the persisted key so language, mode and drafts need no migration.
  lime: {
    dark: {
      fill: brandAccent,
      ink: uiTheme.brand['accent-ink'],
      soft: uiTheme.dark.running,
      text: uiTheme.dark['running-ink'],
    },
    light: {
      fill: brandAccent,
      ink: uiTheme.brand['accent-ink'],
      soft: uiTheme.light.running,
      text: uiTheme.light['running-ink'],
    },
  },
} as const;
export type Accent = keyof typeof palettes;
export function pickerPalette(_accent: Accent) {
  return {
    color: brandAccent,
    darkColor: brandAccent,
    lightColor: brandAccent,
  };
}
export function paletteStyles() {
  const definitions = (mode: 'dark' | 'light') =>
    Object.entries(palettes)
      .map(([id, values]) => {
        const color = values[mode];
        return `--palette-${id}: ${color.fill}; --palette-${id}-ink: ${color.ink}; --palette-${id}-soft: ${color.soft}; --palette-${id}-text: ${color.text};`;
      })
      .join('\n');
  return (
    themeStyles() +
    `/* Generated from ui-palette.ts. Quiet neutral controls; lime primary actions and activity. */\n:root {\n--brand-accent: ${brandAccent};\n${definitions('dark')}\n}\n:root[data-mode='light'] {\n${definitions('light')}\n}\n` +
    Object.keys(palettes)
      .map(
        (id) =>
          `:root[data-accent='${id}'] { --accent: var(--palette-${id}); --accent-ink: var(--palette-${id}-ink); --accent-soft: var(--palette-${id}-soft); --success: var(--palette-${id}-text); }`,
      )
      .join('\n') +
    '\n'
  );
}
