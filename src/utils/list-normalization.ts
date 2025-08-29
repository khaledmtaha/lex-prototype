/**
 * Shared utilities for list prefix normalization
 * Used by both paste processing and backstop transforms
 */

/**
 * Regex patterns for common bullet/number prefixes that need to be stripped.
 * These are literal characters that get pasted as text but shouldn't appear
 * when the content is rendered as a proper list.
 */
export const BULLET_PREFIXES = {
  // Unordered list markers: -, *, •, ◦, ▪, –, —
  // Hyphen first to avoid range semantics in character class
  unordered: /^[-*•◦▪–—]\s+/,
  
  // Ordered list markers: 1. 2. or a) b) etc.
  // Matches: 1. 2) a. A) etc.
  ordered: /^(\d+[.)]|[a-zA-Z][.)])\s+/,
  
  // Combined pattern for efficiency
  combined: /^([-*•◦▪–—]|\d+[.)]|[a-zA-Z][.)])\s+/
} as const;

/**
 * Normalizes NBSP (U+00A0) characters to regular spaces.
 * This is important because pasted content often contains NBSP
 * which can interfere with prefix detection.
 */
export function normalizeNBSP(text: string): string {
  return text.replace(/\u00a0/g, ' ');
}

/**
 * Strips leading bullet/number prefixes from text content.
 * Normalizes NBSP first, then removes at most one prefix.
 * Returns the cleaned text without the prefix.
 */
export function stripListPrefix(text: string): string {
  // Normalize NBSP first
  const normalized = normalizeNBSP(text);
  
  // Strip at most one prefix to avoid accidentally removing legitimate content
  return normalized.replace(BULLET_PREFIXES.combined, '');
}

/**
 * Detects if text starts with a list prefix pattern.
 * Useful for Stage 1 processing to identify non-semantic list items.
 */
export function hasListPrefix(text: string): boolean {
  const normalized = normalizeNBSP(text);
  return BULLET_PREFIXES.combined.test(normalized);
}

/**
 * Detects if text is likely part of a list item.
 * More conservative than hasListPrefix - avoids false positives
 * like single hyphens in prose.
 */
export function isLikelyListItem(text: string): boolean {
  const normalized = normalizeNBSP(text.trim());
  
  // Must have a prefix
  if (!BULLET_PREFIXES.combined.test(normalized)) {
    return false;
  }
  
  // For hyphen/dash lines, require word boundary after prefix
  // This avoids converting "—this—" mid-sentence
  if (/^[-–—]\s/.test(normalized)) {
    // Require at least one word character after the prefix
    return /^[-–—]\s+\w/.test(normalized);
  }
  
  // Don't convert lines that look like Markdown or other formats
  const afterPrefix = normalized.replace(BULLET_PREFIXES.combined, '');
  
  // Skip Markdown fences, headers, blockquotes
  if (/^(```|#{1,6}\s|>\s)/.test(afterPrefix)) {
    return false;
  }
  
  return true;
}

/**
 * Simple depth detection based on glyph tier or indentation.
 * Returns 0-based depth level.
 */
export function detectListDepth(text: string): number {
  const normalized = normalizeNBSP(text);
  
  // Count leading spaces/tabs for indentation-based depth
  const leadingWhitespace = normalized.match(/^(\s*)/)?.[1] || '';
  const spaceCount = leadingWhitespace.replace(/\t/g, '    ').length; // Convert tabs to 4 spaces
  const indentationDepth = Math.floor(spaceCount / 4); // Every 4 spaces = 1 level
  
  // Detect glyph-based depth
  let glyphDepth = 0;
  if (/^[•*-]/.test(normalized.trim())) {
    glyphDepth = 0; // Level 1
  } else if (/^[◦]/.test(normalized.trim())) {
    glyphDepth = 1; // Level 2
  } else if (/^[▪]/.test(normalized.trim())) {
    glyphDepth = 2; // Level 3
  }
  
  // Prefer indentation when both are present, otherwise use glyph tier
  return indentationDepth > 0 ? indentationDepth : glyphDepth;
}