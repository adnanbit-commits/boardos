// lib/template-variables.ts
//
// Variable system for agenda item motion/resolution text.
//
// Syntax:
//   Old (backwards-compatible): {{key}}
//   New (fully defined):        {{key|question label|type}}
//
// Types: text | name | number | date | address | custom
//
// The parser handles both formats. Old-format tokens get auto-generated
// question labels from the key (custodian_name → "Custodian name").
// This ensures existing templates keep working without any migration.

export type VariableType = 'text' | 'name' | 'number' | 'date' | 'address' | 'custom';

export interface TemplateVariable {
  key:      string;       // e.g. "auditor_name"
  label:    string;       // e.g. "Name of the appointed auditor"
  type:     VariableType;
  required: boolean;
}

export interface VariableValues {
  [key: string]: string;
}

// ── Parser ────────────────────────────────────────────────────────────────────

const TOKEN_REGEX = /\{\{([^}]+)\}\}/g;

/**
 * Parse all {{...}} tokens from a text string.
 * Handles both {{key}} and {{key|label|type}} formats.
 */
export function parseVariables(text: string): TemplateVariable[] {
  if (!text) return [];
  const seen = new Set<string>();
  const variables: TemplateVariable[] = [];

  let match: RegExpExecArray | null;
  TOKEN_REGEX.lastIndex = 0;

  while ((match = TOKEN_REGEX.exec(text)) !== null) {
    const parts = match[1].split('|').map(p => p.trim());
    const key   = parts[0];
    if (!key || seen.has(key)) continue;
    seen.add(key);

    const label = parts[1] ?? humanise(key);
    const type  = (parts[2] as VariableType) ?? 'text';

    variables.push({ key, label, type, required: true });
  }

  return variables;
}

/**
 * Parse variables from both motionText and resolutionText,
 * deduplicating by key. Used when building the variables array for an agenda item.
 */
export function parseAllVariables(motionText: string, resolutionText?: string): TemplateVariable[] {
  const fromMotion     = parseVariables(motionText);
  const fromResolution = parseVariables(resolutionText ?? '');
  const seen           = new Set(fromMotion.map(v => v.key));
  const extra          = fromResolution.filter(v => !seen.has(v.key));
  return [...fromMotion, ...extra];
}

/**
 * Render text with variable values substituted.
 * Unfilled variables return the token as-is for display layer to handle.
 */
export function renderText(text: string, values: VariableValues): string {
  if (!text) return '';
  TOKEN_REGEX.lastIndex = 0;
  return text.replace(TOKEN_REGEX, (match, inner) => {
    const key = inner.split('|')[0].trim();
    return values[key] !== undefined && values[key] !== '' ? values[key] : match;
  });
}

/**
 * Check if all variables in a text are filled.
 */
export function allFilled(text: string, values: VariableValues): boolean {
  TOKEN_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = TOKEN_REGEX.exec(text)) !== null) {
    const key = match[1].split('|')[0].trim();
    if (!values[key]) return false;
  }
  return true;
}

/**
 * Count unfilled variables across motion and resolution text.
 */
export function countUnfilled(motionText: string, resolutionText: string | undefined, values: VariableValues): number {
  const vars = parseAllVariables(motionText, resolutionText);
  return vars.filter(v => !values[v.key]).length;
}

/**
 * Validate that all {{...}} tokens in a text have labels defined.
 * Used in template builder to block saving incomplete variables.
 * Returns list of keys missing labels.
 */
export function validateVariableLabels(
  text: string,
  defined: TemplateVariable[]
): string[] {
  const parsed  = parseVariables(text);
  const defined_keys = new Set(defined.map(v => v.key));
  // A variable needs a label if it uses the new {{key|label|type}} syntax
  // Old {{key}} format is always valid (gets auto-label)
  // New format is invalid only if the label is empty after the pipe
  TOKEN_REGEX.lastIndex = 0;
  const missing: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = TOKEN_REGEX.exec(text)) !== null) {
    const parts = match[1].split('|');
    if (parts.length >= 2 && !parts[1].trim()) {
      missing.push(parts[0].trim());
    }
  }
  return missing;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Convert snake_case key to human readable label.
 * custodian_name → "Custodian name"
 */
export function humanise(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c, i) => i === 0 ? c.toUpperCase() : c.toLowerCase());
}

/**
 * Build a {{key|label|type}} token string.
 */
export function buildToken(key: string, label: string, type: VariableType): string {
  return `{{${key}|${label}|${type}}}`;
}

/**
 * Check if text contains any variable tokens.
 */
export function hasVariables(text: string): boolean {
  TOKEN_REGEX.lastIndex = 0;
  return TOKEN_REGEX.test(text);
}

/**
 * Extract just the raw token strings from text.
 * Used for highlighting in the UI.
 */
export function extractTokens(text: string): { token: string; key: string; start: number; end: number }[] {
  const results: { token: string; key: string; start: number; end: number }[] = [];
  TOKEN_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = TOKEN_REGEX.exec(text)) !== null) {
    results.push({
      token: match[0],
      key:   match[1].split('|')[0].trim(),
      start: match.index,
      end:   match.index + match[0].length,
    });
  }
  return results;
}
