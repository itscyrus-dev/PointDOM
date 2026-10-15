export function extensionBrowserArgs(extension: string) {
  return [
    // Linux Chromium can limit compositor frames in inactive extension views to
    // 1 Hz, despite Playwright's background-timer flags. Keep real animations and
    // actionability checks while removing that artificial test-only frame limit.
    ...(process.platform === 'linux' ? ['--disable-frame-rate-limit'] : []),
    '--enable-unsafe-extension-debugging',
    '--disable-features=DisableLoadExtensionCommandLineSwitch',
    `--disable-extensions-except=${extension}`,
    `--load-extension=${extension}`,
  ];
}
