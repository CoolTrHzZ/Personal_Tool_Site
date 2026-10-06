export const TOOL_PERMISSION_KEYS: readonly ['clipboard', 'storage', 'network', 'notifications', 'modals', 'download', 'externalLinks', 'sameOrigin', 'popups']
export const DEFAULT_PERMISSIONS: Record<(typeof TOOL_PERMISSION_KEYS)[number], boolean>
export function assertToolPermissions(value: unknown): void
