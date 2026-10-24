// JSON.stringify emits array-index keys (0..2^32-2) first, in numeric order. Other keys
// retain this locale-independent UTF-16 code-unit order. Arrays retain order.
export function sortJsonKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJsonKeys)
  if (value === null || typeof value !== 'object') return value
  // fromEntries creates own data properties, including __proto__, without setters.
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, sortJsonKeys((value as Record<string, unknown>)[key])]))
}
