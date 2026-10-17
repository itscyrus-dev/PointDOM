import { brandAccent } from './ui-palette.js';

// One geometric mark for the panel, toolbar and extension management page.
export const logoFrame = 'M7.5 13V9a1.5 1.5 0 0 1 1.5-1.5h4M19 24.5h4a1.5 1.5 0 0 0 1.5-1.5v-4';
export const logoDot = { cx: 16, cy: 16, r: 3.5 } as const;

export function logoSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none">
  <title>PointDOM</title>
  <defs>
    <linearGradient id="surface" x1="4" y1="2" x2="27" y2="32" gradientUnits="userSpaceOnUse">
      <stop stop-color="#34383c"/><stop offset="1" stop-color="#141619"/>
    </linearGradient>
    <linearGradient id="frame" x1="8" y1="7" x2="24" y2="25" gradientUnits="userSpaceOnUse">
      <stop stop-color="#ffffff"/><stop offset="1" stop-color="#c8cdd1"/>
    </linearGradient>
    <radialGradient id="point" cx="0.35" cy="0.25" r="0.8">
      <stop stop-color="#d3ff7a"/><stop offset="1" stop-color="${brandAccent}"/>
    </radialGradient>
  </defs>
  <rect x="1" y="1" width="30" height="30" rx="7" fill="url(#surface)"/>
  <rect x="1.25" y="1.25" width="29.5" height="29.5" rx="6.75" stroke="#ffffff" stroke-opacity="0.12" stroke-width="0.5"/>
  <path d="${logoFrame}" transform="translate(0 0.5)" stroke="#000000" stroke-opacity="0.35" stroke-width="2.75" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="${logoFrame}" stroke="url(#frame)" stroke-width="2.75" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="16" cy="16.5" r="3.5" fill="#000000" fill-opacity="0.3"/>
  <circle cx="${logoDot.cx}" cy="${logoDot.cy}" r="${logoDot.r}" fill="url(#point)"/>
</svg>\n`;
}
