export type InstallPlatform = 'mac' | 'win';
export const newConnectionNonce = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');

export async function connectionChallenge(nonce: string) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(nonce));
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function desktopConnectionLink(extensionId: string, challenge: string) {
  if (!/^[a-p]{32}$/.test(extensionId) || !/^[a-f0-9]{64}$/.test(challenge))
    throw new Error('Invalid desktop connection parameters.');
  return `pointdom://connect?extensionId=${extensionId}&challenge=${challenge}`;
}

export function desktopProjectLink(origin: string) {
  const url = new URL(origin);
  if (
    !/^https?:$/.test(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  )
    throw new Error('Open a project web page before binding.');
  return `pointdom://bind?origin=${encodeURIComponent(url.origin)}`;
}
