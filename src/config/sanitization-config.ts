/**
 * DOMPurify configuration for Smart Paste sanitization.
 * 
 * Stage 1 of the two-stage pipeline: sanitizes and enriches HTML content
 * before converting to Lexical nodes. Stage 2 (transform) enforces policy.
 */

import DOMPurify from 'dompurify';

// Guard to prevent duplicate hook registration during HMR/React StrictMode
let hooksRegistered = false;

/**
 * Strict whitelist of allowed HTML tags for paste sanitization.
 * These align with supported Lexical node types.
 */
export const ALLOWED_TAGS = [
  // Block elements
  'p',           // ParagraphNode
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', // HeadingNode (h4-h6 will be normalized to h3 by Stage 2)
  'ul', 'ol',    // ListNode
  'li',          // ListItemNode
  'blockquote',  // QuoteNode
  'pre',         // CodeNode (block)
  'hr',          // HorizontalRuleNode
  
  // Inline elements
  'strong',      // TextNode with bold format
  'em',          // TextNode with italic format
  'code',        // TextNode with code format
  'a',           // LinkNode
  'br'           // LineBreakNode
] as const;

/**
 * Allowed attributes per tag.
 * Only essential attributes for functionality are preserved.
 */
export const ALLOWED_ATTRIBUTES: Record<string, string[]> = {
  a: ['href', 'title', 'target', 'rel'], // Links: allow title for accessibility
  // All other tags: no attributes allowed (removes style, onclick, etc.)
};

/**
 * Explicitly allowed URI schemes - only safe protocols.
 */
export const ALLOWED_SCHEMES = ['http', 'https', 'mailto'] as const;

/**
 * URL validation regex: allows only safe protocols.
 * Explicitly blocks javascript:, data:, and other potentially malicious schemes.
 */
export const ALLOWED_URI_REGEXP = /^(?:https?:|mailto:|#)/i;

/**
 * Production-hardened DOMPurify configuration for Smart Paste sanitization.
 * This creates a secure, predictable HTML structure that maps cleanly to Lexical nodes.
 */
export const SANITIZATION_CONFIG: DOMPurify.Config = {
  // Only allow whitelisted tags
  ALLOWED_TAGS: ALLOWED_TAGS as unknown as string[],
  
  // Only allow specific attributes on specific tags
  ALLOWED_ATTR: Object.values(ALLOWED_ATTRIBUTES).flat(),
  
  // URL sanitization for links
  ALLOWED_URI_REGEXP,
  
  // Security hardening: explicitly forbidden elements
  FORBID_SCRIPTS: true,
  FORBID_TAGS: [
    'script', 'object', 'embed', 'iframe', 'form', 'input', 'textarea', 'select',
    'svg', 'math', 'style', 'link', 'meta', 'title', 'head', 'body', 'html',
    'applet', 'bgsound', 'base', 'basefont', 'frame', 'frameset', 'noframes'
  ],
  
  // Security hardening: explicitly forbidden attributes
  FORBID_ATTR: [
    'style', 'class', 'id', // Styling and identification
    'onclick', 'onload', 'onerror', 'onmouseover', 'onfocus', 'onblur', 'onchange', // Event handlers
    'on*', // Catch-all for event handlers
    'srcset', 'sizes', // Image loading
    'xlink:href', 'xmlns', // XML/SVG
    'data-*', // Data attributes (can be vectors)
    'contenteditable', 'draggable', 'dropzone', 'hidden', 'spellcheck', 'translate' // Interactive attributes
  ],
  
  // Prevent document clobbering and ensure contained output
  WHOLE_DOCUMENT: false,
  RETURN_DOM: false,
  RETURN_DOM_FRAGMENT: false,
  
  // Use HTML profile to disable SVG/MathML
  USE_PROFILES: { html: true }
};

/**
 * Register DOMPurify hooks for additional security enforcement.
 * CRITICAL: Hooks must be registered globally, NOT in the config object.
 */
function registerSecurityHooks() {
  if (hooksRegistered) {
    return; // Prevent duplicate registration during HMR/React StrictMode
  }

  // Hook 1: Sanitize attributes - enforce URL protocol allowlist
  DOMPurify.addHook('uponSanitizeAttribute', function(currentNode, hookEvent, config) {
    const { attrName, attrValue } = hookEvent;
    
    // Check href attributes for safe protocols
    if (attrName === 'href' && attrValue) {
      const url = attrValue.trim().toLowerCase();
      
      // Block javascript:, data:, vbscript: schemes explicitly
      if (url.startsWith('javascript:') || url.startsWith('data:') || url.startsWith('vbscript:')) {
        hookEvent.forceKeepAttr = false;
        return;
      }
      
      // Allow only explicitly safe schemes or relative URLs
      const hasAllowedScheme = ALLOWED_SCHEMES.some(scheme => url.startsWith(scheme + ':'));
      const isRelativeUrl = url.startsWith('/') || url.startsWith('./') || url.startsWith('../') || url.startsWith('#');
      
      // Only block if it has a scheme AND that scheme is not allowed
      if (url.includes(':') && !hasAllowedScheme && !isRelativeUrl) {
        hookEvent.forceKeepAttr = false;
        return;
      }
    }
  });

  // Hook 2: After sanitization - enforce security attributes on all links
  DOMPurify.addHook('afterSanitizeAttributes', function(currentNode) {
    // Enforce security attributes on all anchor tags
    if (currentNode.tagName === 'A') {
      // Always set security attributes (CRITICAL for XSS prevention)
      currentNode.setAttribute('rel', 'noopener noreferrer ugc');
      currentNode.setAttribute('target', '_blank');
      
      // Remove any remaining dangerous attributes that might have slipped through
      const dangerousAttrs = ['onclick', 'onmouseover', 'style', 'class', 'id'];
      dangerousAttrs.forEach(attr => {
        if (currentNode.hasAttribute(attr)) {
          currentNode.removeAttribute(attr);
        }
      });
    }
    
    // Remove any data attributes from all elements (additional safety)
    if (currentNode.nodeType === 1) { // Element node
      const attributes = Array.from(currentNode.attributes);
      attributes.forEach(attr => {
        if (attr.name.startsWith('data-') || attr.name.startsWith('on')) {
          currentNode.removeAttribute(attr.name);
        }
      });
    }
  });

  hooksRegistered = true;
}

// Register hooks immediately when module is loaded
registerSecurityHooks();

/**
 * Sanitizes HTML content for safe paste operations.
 * 
 * @param htmlContent - Raw HTML from clipboard
 * @returns Sanitized HTML string safe for processing
 */
export function sanitizeHTML(htmlContent: string): string {
  if (!htmlContent || typeof htmlContent !== 'string') {
    return '';
  }

  try {
    const sanitized = DOMPurify.sanitize(htmlContent, SANITIZATION_CONFIG);
    
    // Additional validation: ensure we got a string back
    if (typeof sanitized !== 'string') {
      console.warn('[SmartPaste] DOMPurify returned non-string result, falling back to empty');
      return '';
    }

    return sanitized;
  } catch (error) {
    console.error('[SmartPaste] Sanitization failed:', error);
    return ''; // Fail safe: return empty string on error
  }
}

/**
 * Size limit for paste content (500KB as specified in plan).
 * Content exceeding this will trigger plaintext fallback.
 */
export const MAX_PASTE_SIZE = 500 * 1024; // 500KB

/**
 * Checks if HTML content exceeds size limit.
 */
export function exceedsSizeLimit(htmlContent: string): boolean {
  return new Blob([htmlContent], { type: 'text/html' }).size > MAX_PASTE_SIZE;
}