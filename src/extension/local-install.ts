export type InstallPlatform = 'mac' | 'win';
export function localInstallCommand(
  platform: InstallPlatform,
  extensionId: string,
  challenge: string,
  version: string,
) {
  if (
    !/^[a-p]{32}$/.test(extensionId) ||
    !/^[a-f0-9]{64}$/.test(challenge) ||
    !/^\d+\.\d+\.\d+$/.test(version)
  )
    throw new Error('Invalid installation command parameters.');
  const base = `https://github.com/itscyrus-dev/PointDOM/releases/download/v${version}`;
  return platform === 'mac'
    ? `curl -fsSL ${base}/install.sh | sh -s -- --extension-id ${extensionId} --challenge ${challenge}`
    : `& ([scriptblock]::Create((Invoke-RestMethod '${base}/install.ps1'))) -ExtensionId ${extensionId} -Challenge ${challenge}`;
}
export const newConnectionNonce = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');

export async function connectionChallenge(nonce: string) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(nonce));
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
