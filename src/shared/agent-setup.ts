import { clientSetupInstruction } from './agent-clients.js';
/** Generic setup follows the same universal connection contract as the client picker. */
export function agentSetupInstruction(language: 'zh-CN' | 'en'): string {
  return clientSetupInstruction(language, 'other');
}
