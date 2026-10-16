import { createHash, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

export const bootstrapGrantSchema = z
  .object({
    extensionId: z.string().regex(/^[a-p]{32}$/),
    challenge: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
export const bootstrapPollSchema = z.object({ nonce: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
const digest = (nonce: string) => createHash('sha256').update(nonce).digest();

/** Only the authenticated local CLI can authorize a browser's pending challenge. */
export class BootstrapGrants {
  private grants = new Map<string, { hash: Buffer; until: number }>();
  constructor(private now = Date.now) {}
  private prune() {
    for (const [origin, grant] of this.grants)
      if (grant.until <= this.now()) this.grants.delete(origin);
  }
  authorize(input: z.infer<typeof bootstrapGrantSchema>) {
    this.prune();
    const origin = `chrome-extension://${input.extensionId}`;
    if (!this.grants.has(origin) && this.grants.size >= 32)
      throw new Error('Too many pending connections. Retry after 15 minutes.');
    this.grants.set(origin, {
      hash: Buffer.from(input.challenge, 'hex'),
      until: this.now() + 15 * 60_000,
    });
  }
  allows(origin: string, nonce: string) {
    this.prune();
    const grant = this.grants.get(origin);
    return Boolean(grant && timingSafeEqual(grant.hash, digest(nonce)));
  }
}
