import { gray, grayDark, blue, blueDark, red, redDark, amber, amberDark } from '@radix-ui/colors';

/** Official Radix scales; the persisted accent identifier is independent of these colors. */
export const uiTheme = {
  brand: { accent: blue.blue9, 'accent-ink': gray.gray12 },
  light: {
    page: gray.gray1,
    card: gray.gray2,
    control: gray.gray3,
    text: gray.gray12,
    muted: gray.gray11,
    'control-ink': gray.gray12,
    'control-hover-ink': gray.gray12,
    'control-hover': gray.gray4,
    'control-pressed': gray.gray5,
    'disabled-ink': gray.gray9,
    edge: gray.gray4,
    'edge-strong': gray.gray7,
    navigation: gray.gray2,
    'navigation-ink': blue.blue9,
    selection: gray.gray3,
    'selection-ink': gray.gray12,
    primary: blue.blue11,
    'primary-ink': gray.gray1,
    'primary-hover': blue.blue12,
    'primary-pressed': blue.blue12,
    completed: gray.gray3,
    'completed-ink': gray.gray11,
    running: blue.blue3,
    'running-ink': blue.blue12,
    online: blue.blue9,
    'activity-track': blue.blue6,
    'activity-tail': blue.blue8,
    'activity-head': blue.blue11,
    error: red.red11,
    'error-soft': red.red3,
    warning: amber.amber11,
    'warning-soft': amber.amber3,
  },
  dark: {
    page: grayDark.gray1,
    card: grayDark.gray2,
    control: grayDark.gray3,
    text: grayDark.gray12,
    muted: grayDark.gray11,
    'control-ink': grayDark.gray12,
    'control-hover-ink': grayDark.gray12,
    'control-hover': grayDark.gray4,
    'control-pressed': grayDark.gray5,
    'disabled-ink': grayDark.gray9,
    edge: grayDark.gray4,
    'edge-strong': grayDark.gray7,
    navigation: grayDark.gray3,
    'navigation-ink': blueDark.blue9,
    selection: grayDark.gray3,
    'selection-ink': grayDark.gray12,
    primary: blueDark.blue11,
    'primary-ink': blueDark.blue1,
    'primary-hover': blueDark.blue12,
    'primary-pressed': blueDark.blue12,
    completed: grayDark.gray3,
    'completed-ink': grayDark.gray11,
    running: blueDark.blue3,
    'running-ink': blueDark.blue12,
    online: blueDark.blue9,
    'activity-track': blueDark.blue6,
    'activity-tail': blueDark.blue8,
    'activity-head': blueDark.blue11,
    error: redDark.red11,
    'error-soft': redDark.red3,
    warning: amberDark.amber11,
    'warning-soft': amberDark.amber3,
  },
} as const;

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
    `/* Generated from ui-palette.ts. Radix Gray surfaces and Blue interaction states. */\n:root {\n--brand-accent: ${brandAccent};\n${definitions('dark')}\n}\n:root[data-mode='light'] {\n${definitions('light')}\n}\n` +
    Object.keys(palettes)
      .map(
        (id) =>
          `:root[data-accent='${id}'] { --accent: var(--palette-${id}); --accent-ink: var(--palette-${id}-ink); --accent-soft: var(--palette-${id}-soft); --success: var(--palette-${id}-text); }`,
      )
      .join('\n') +
    '\n'
  );
}
