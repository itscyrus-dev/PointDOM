import type { DeliveryActions } from '../src/bridge/delivery.js';
// Explicit injection: tests never touch the user's clipboard, clients or paid models.
export const fixtureDelivery: DeliveryActions = {
  hasCli: (target) => target !== 'mcp',
  paste: async () => ({ state: 'copied', detail: 'Fixture instruction prepared.' }),
};
