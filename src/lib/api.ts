import type { IpcResult } from './types';

// Browser fallback — used when the app is opened in a regular browser preview
// (no Electron preload available). Keeps the UI demo-able without the desktop runtime.
const browserMockMessage =
  'This action requires the CLAW desktop application. Open the installed app to use this feature.';

function isElectron() {
  return typeof window !== 'undefined' && !!window.claw;
}

export async function invoke<T = unknown>(channel: string, args?: unknown): Promise<T> {
  if (!isElectron()) {
    throw new Error(browserMockMessage);
  }
  const res: IpcResult<T> = await window.claw.api.invoke<T>(channel, args);
  if (!res.ok) throw new Error(res.error);
  return res.data;
}

export const api = {
  // Cases
  cases: {
    list: (params?: { status?: string; term?: string; search?: string }) => invoke('cases:list', params),
    get: (id: string) => invoke('cases:get', { id }),
    create: (input: any, actor?: any) => invoke('cases:create', { input, actor }),
    update: (id: string, patch: any, actor?: any) => invoke('cases:update', { id, patch, actor }),
    delete: (id: string, actor?: any) => invoke('cases:delete', { id, actor }),
    stats: () => invoke('cases:stats'),
  },
  // Documents
  documents: {
    list: (params?: { caseId?: string; category?: string }) => invoke('documents:list', params),
    upload: (input: any, actor?: any) => invoke('documents:upload', { ...input, actor }),
    update: (id: string, patch: any, actor?: any) => invoke('documents:update', { id, patch, actor }),
    delete: (id: string, actor?: any) => invoke('documents:delete', { id, actor }),
    resolve: (id: string) => invoke('documents:resolve', { id }),
    readBytes: (id: string) => invoke('documents:readBytes', { id }),
    indexText: (id: string, text: string, pages?: number, actor?: any) =>
      invoke('documents:indexText', { id, text, pages, actor }),
  },
  // Workflow
  workflow: {
    list: (params?: { caseId?: string; stage?: string }) => invoke('workflow:list', params),
    summary: () => invoke('workflow:summary'),
    create: (input: any, actor?: any) => invoke('workflow:create', { input, actor }),
    update: (id: string, patch: any, actor?: any) => invoke('workflow:update', { id, patch, actor }),
    advance: (id: string, actor?: any) => invoke('workflow:advance', { id, actor }),
    retreat: (id: string, actor?: any) => invoke('workflow:retreat', { id, actor }),
    block: (id: string, reason: string, actor?: any) => invoke('workflow:block', { id, reason, actor }),
    unblock: (id: string, actor?: any) => invoke('workflow:unblock', { id, actor }),
    delete: (id: string, actor?: any) => invoke('workflow:delete', { id, actor }),
  },
  // Calendar
  calendar: {
    list: (params?: { from?: number; to?: number; term?: string; roster?: string }) => invoke('calendar:list', params),
    create: (input: any, actor?: any) => invoke('calendar:create', { input, actor }),
    update: (id: string, patch: any, actor?: any) => invoke('calendar:update', { id, patch, actor }),
    delete: (id: string, actor?: any) => invoke('calendar:delete', { id, actor }),
  },
  // Audit
  audit: {
    list: (params?: { entityType?: string; entityId?: string; search?: string; limit?: number; offset?: number }) =>
      invoke('audit:list', params),
    count: (params?: any) => invoke('audit:count', params),
    verify: () => invoke('audit:verify'),
  },
  // Verification
  verification: {
    run: (input: { text: string; caseId?: string; documentId?: string }, actor?: any) =>
      invoke('verification:run', { ...input, actor }),
    list: (params?: { caseId?: string; documentId?: string }) => invoke('verification:list', params),
    override: (id: string, patch: { status: string; notes?: string }, actor?: any) =>
      invoke('verification:override', { id, patch, actor }),
    delete: (id: string, actor?: any) => invoke('verification:delete', { id, actor }),
    manualAdd: (input: any, actor?: any) => invoke('verification:manualAdd', { ...input, actor }),
  },
  // Generator
  generator: {
    templates: () => invoke('generator:templates'),
    create: (input: any, actor?: any) => invoke('generator:create', { input, actor }),
    list: (params?: { caseId?: string }) => invoke('generator:list', params),
    update: (id: string, patch: any, actor?: any) => invoke('generator:update', { id, patch, actor }),
    delete: (id: string, actor?: any) => invoke('generator:delete', { id, actor }),
  },
  // Agent
  agent: {
    threads: () => invoke('agent:threads'),
    thread: (id: string) => invoke('agent:thread', { id }),
    createThread: (input: { title?: string; caseId?: string }, actor?: any) =>
      invoke('agent:createThread', { ...input, actor }),
    updateThread: (id: string, patch: { title?: string; case_id?: string | null }, actor?: any) =>
      invoke('agent:updateThread', { id, patch, actor }),
    deleteThread: (id: string, actor?: any) => invoke('agent:deleteThread', { id, actor }),
    send: (input: { threadId: string; content: string }, actor?: any) =>
      invoke('agent:send', { ...input, actor }),
  },
  // Settings
  settings: {
    all: () => invoke('settings:all'),
    get: (key: string) => invoke('settings:get', { key }),
    set: (key: string, value: string, actor?: any) => invoke('settings:set', { key, value, actor }),
    setMany: (patch: Record<string, string>, actor?: any) => invoke('settings:setMany', { patch, actor }),
  },
  users: {
    list: () => invoke('users:list'),
    current: () => invoke('users:current'),
    create: (input: any, actor?: any) => invoke('users:create', { input, actor }),
    update: (id: string, patch: any, actor?: any) => invoke('users:update', { id, patch, actor }),
    delete: (id: string, actor?: any) => invoke('users:delete', { id, actor }),
    setCurrent: (id: string, actor?: any) => invoke('users:setCurrent', { id, actor }),
  },
  // Dashboard
  dashboard: {
    snapshot: () => invoke('dashboard:snapshot'),
  },
  // Search
  search: {
    global: (query: string, limit = 12) => invoke('search:global', { query, limit }),
  },
};

export { isElectron };
