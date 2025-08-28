/**
 * Shared constants for heading policy enforcement.
 * Single source of truth to prevent drift across components.
 */

import { HeadingTagType } from '../types/editor-types';

/**
 * Heading levels allowed in the editor.
 * Commands, toolbar, and transforms should only work with these tags.
 */
export const ALLOWED_HEADING_TAGS: readonly HeadingTagType[] = ['h1', 'h2', 'h3'] as const;

/**
 * All HTML heading tags that might be encountered in paste/import.
 * Used for normalization detection and DOM processing.
 */
export const ALL_HEADING_TAGS: readonly string[] = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] as const;

/**
 * Tags that should be normalized to h3 to preserve content.
 */
export const DISALLOWED_HEADING_TAGS: readonly string[] = ['h4', 'h5', 'h6'] as const;

/**
 * Check if a heading tag is allowed in the editor.
 */
export function isAllowedHeadingTag(tag: string): tag is HeadingTagType {
  return ALLOWED_HEADING_TAGS.includes(tag as HeadingTagType);
}

/**
 * Check if a heading tag should be normalized.
 */
export function shouldNormalizeHeadingTag(tag: string): boolean {
  return DISALLOWED_HEADING_TAGS.includes(tag);
}