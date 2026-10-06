export const TOOL_PERMISSION_KEYS = Object.freeze(['clipboard', 'storage', 'network', 'notifications', 'modals', 'download', 'externalLinks', 'sameOrigin', 'popups'])
export const DEFAULT_PERMISSIONS = Object.freeze({ clipboard: true, storage: true, network: false, notifications: false, modals: false, download: false, externalLinks: false, sameOrigin: false, popups: false })

export function assertToolPermissions(value) {
  if (value === undefined) return
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.entries(value).some(([key, allowed]) => !TOOL_PERMISSION_KEYS.includes(key) || typeof allowed !== 'boolean')) throw new Error('工具 permissions 必须仅包含支持的权限名称和布尔开关')
}
