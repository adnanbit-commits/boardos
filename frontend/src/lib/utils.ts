// src/lib/utils.ts
// Utility helpers shared across components.

/**
 * Merges class names, filtering out falsy values.
 * Drop-in replacement for clsx/classnames without the extra dependency.
 */
export function cn(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(' ');
}
