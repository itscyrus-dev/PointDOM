import { z } from 'zod';
export const latestReleaseUrl =
  'https://api.github.com/repos/itscyrus-dev/PointDOM/releases/latest';
const versionSchema = z
  .string()
  .max(40)
  .regex(/^\d+\.\d+\.\d+(?:\.\d+)?$/)
  .refine((value) => value.split('.').every((part) => Number.isSafeInteger(Number(part))));
export function compareVersions(a: string, b: string) {
  const left = versionSchema.parse(a).split('.').map(Number),
    right = versionSchema.parse(b).split('.').map(Number);
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const difference = (left[i] || 0) - (right[i] || 0);
    if (difference) return Math.sign(difference);
  }
  return 0;
}
export async function checkLatestRelease(current: string, signal?: AbortSignal) {
  versionSchema.parse(current);
  const response = await fetch(latestReleaseUrl, {
    headers: { Accept: 'application/vnd.github+json' },
    credentials: 'omit',
    cache: 'no-store',
    redirect: 'error',
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(8000)])
      : AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error('Release check failed');
  const release = z
    .object({
      tag_name: z.string().regex(/^v\d+\.\d+\.\d+$/),
      draft: z.literal(false),
      prerelease: z.literal(false),
    })
    .parse(await response.json());
  const latest = release.tag_name.slice(1);
  const comparison = compareVersions(current, latest);
  return {
    latest,
    status:
      comparison < 0
        ? ('available' as const)
        : comparison === 0
          ? ('current' as const)
          : ('ahead' as const),
  };
}
