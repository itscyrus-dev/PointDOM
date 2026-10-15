// Brand marks and page selection keep their identity; panel actions use monochrome contrast.
export const brandAccent = '#a8ff00';
export const palettes = {
  // Retain the persisted key so existing language, mode and drafts need no migration.
  lime: {
    dark: { fill: '#f1f3f5', ink: '#15181b', soft: '#f1f3f512', text: '#dce0e5' },
    light: { fill: '#191c20', ink: '#ffffff', soft: '#191c200c', text: '#30363c' },
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
    `/* Generated from ui-palette.ts. Monochrome actions; lime brand and page selection. */\n:root {\n--brand-accent: ${brandAccent};\n${definitions('dark')}\n}\n:root[data-mode='light'] {\n${definitions('light')}\n}\n` +
    Object.keys(palettes)
      .map(
        (id) =>
          `:root[data-accent='${id}'] { --accent: var(--palette-${id}); --accent-ink: var(--palette-${id}-ink); --accent-soft: var(--palette-${id}-soft); --success: var(--palette-${id}-text); }`,
      )
      .join('\n') +
    '\n'
  );
}
