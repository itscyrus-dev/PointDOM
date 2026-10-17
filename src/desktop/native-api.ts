import { invoke } from '@tauri-apps/api/core';
import type { Job, Project, AgentConnection, Cancellation } from '../shared/contracts.js';
export type Snapshot = {
  appVersion: string;
  servicePort: number;
  appSettings: { showMenuBarIcon: boolean; language?: 'zh-CN' | 'en' | null };
  connected: boolean;
  paired: boolean;
  discovery?: {
    status: 'scanning' | 'ready' | 'unavailable' | 'unsupported';
    candidates: { id: string; name: string; cwd: string; origins: string[] }[];
  };
  pairingRequests?: { id: string; challenge: string }[];
  projects: Project[];
  projectNames?: Record<string, string>;
  jobs: Job[];
  agents: AgentConnection[];
  pending: number;
  error: string | null;
  capabilities: { id: string; name: string; listening: boolean; wakeup: boolean }[];
};
export const native = {
  snapshot: () => invoke<Snapshot>('snapshot'),
  chooseFolder: () => invoke<string | null>('choose_folder'),
  addProject: (name: string, origin: string) => invoke<void>('add_project', { name, origin }),
  fitWindow: (height: number) =>
    invoke<void>('fit_main_window', { height, viewportHeight: innerHeight }),
  setMenuBarVisibility: (visible: boolean) => invoke<void>('set_menu_bar_visibility', { visible }),
  setLanguage: (language: 'zh-CN' | 'en') => invoke<void>('set_language', { language }),
  retry: () => invoke<void>('retry_service'),
  openResource: (resource: 'repository' | 'releases' | 'feedback') =>
    invoke<void>('open_resource', { resource }),
  approveExtension: (id: string, challenge: string) =>
    invoke<void>('approve_extension', { id, challenge }),
  confirmDiscovery: (id: string) => invoke<void>('confirm_discovery', { id }),
  openProject: (id: string) => invoke<void>('open_project', { id }),
  removeProject: (id: string) => invoke<boolean>('remove_project', { id }),
  openExtensions: () => invoke<void>('open_extensions'),
  revealExtension: () => invoke<void>('reveal_extension'),
  connectCodex: () => invoke<boolean>('connect_codex'),
  configuration: () => invoke<string>('mcp_configuration'),
  cancel: (id: string) => invoke<Cancellation>('cancel_job', { id }),
  openMain: (id?: string) => invoke<void>('open_main', { id: id || null }),
  motion: (reduced: boolean) => invoke<void>('set_reduced_motion', { reduced }),
};
