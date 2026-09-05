const placeholder = /\{\{\s*([^{}\r\n]+?)\s*\}\}/g
export function promptVariables(template: string): string[] {
  return [...new Set([...template.matchAll(placeholder)].map(match => match[1].trim()))]
}
export function fillPrompt(template: string, values: Record<string, string>): string {
  return template.replace(placeholder, (original, name: string) => { const value = values[name.trim()]; return typeof value === 'string' && value.trim() ? value : original })
}
