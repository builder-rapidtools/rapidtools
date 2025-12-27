/**
 * Deterministic JSON canonicalization
 *
 * Guarantees:
 * - Keys sorted alphabetically at all nesting levels
 * - No undefined values
 * - Consistent string escaping
 * - Same input always produces identical output
 */

/**
 * Recursively sorts object keys and removes undefined values
 */
function sortObjectKeys(obj: unknown): unknown {
  if (obj === null || obj === undefined) {
    return null;
  }

  if (Array.isArray(obj)) {
    return obj.map(sortObjectKeys);
  }

  if (typeof obj === 'object') {
    const sorted: Record<string, unknown> = {};
    const keys = Object.keys(obj as Record<string, unknown>).sort();

    for (const key of keys) {
      const value = (obj as Record<string, unknown>)[key];
      // Skip undefined values entirely
      if (value !== undefined) {
        sorted[key] = sortObjectKeys(value);
      }
    }

    return sorted;
  }

  return obj;
}

/**
 * Produces a deterministic canonical JSON string
 * - Keys sorted alphabetically at all levels
 * - No whitespace
 * - Consistent escaping
 */
export function canonicalizeJson(obj: unknown): string {
  const sorted = sortObjectKeys(obj);
  return JSON.stringify(sorted);
}

/**
 * Validates and canonicalizes an event object
 * Returns the canonical event object (not string)
 */
export function canonicalizeEvent(event: Record<string, unknown>): Record<string, unknown> {
  return sortObjectKeys(event) as Record<string, unknown>;
}
