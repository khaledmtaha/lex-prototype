import { useEffect } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { ListItemNode, $isListItemNode } from '@lexical/list';
import { $isTextNode, $isElementNode, TextNode, LexicalEditor, $isParagraphNode, ParagraphNode } from 'lexical';
import { $isCodeNode } from '@lexical/code';
import { logDevWarning } from '../utils/dev-logger';
import { stripListPrefix } from '../utils/list-normalization';

// Singleton pattern: prevent duplicate registrations
const registeredEditors = new WeakSet<LexicalEditor>();

// Rate-limit logging
const warnedPrefixes = new Set<string>();

/**
 * Checks if a TextNode has code formatting.
 * In older Lexical versions, use alternative detection methods.
 */
function isCodeFormattedText(node: TextNode): boolean {
  // Try modern format bit detection first
  if ('hasFormat' in node) {
    return (node as any).hasFormat('code');
  }
  
  // Fallback: check if format property includes code
  const format = (node as any).getFormat?.() || 0;
  const CODE_FORMAT = 16; // FORMAT_CODE constant
  return (format & CODE_FORMAT) !== 0;
}

/**
 * Determines if we should skip prefix stripping for this node.
 * Skips code nodes and text with code formatting.
 */
function shouldSkipPrefixStripping(node: TextNode): boolean {
  // Walk up the tree to check for code nodes
  let parent = node.getParent();
  while (parent) {
    if ($isCodeNode(parent)) {
      return true;
    }
    // Also check for nodes with type 'code' for broader compatibility
    if (parent.getType() === 'code') {
      return true;
    }
    parent = parent.getParent();
  }
  
  // Check if this text node has code formatting
  if (isCodeFormattedText(node)) {
    return true;
  }
  
  return false;
}

/**
 * Plugin that normalizes list items by removing double bullet prefixes.
 * 
 * This handles the common issue where pasted content contains literal
 * bullet characters (-, *, •) that create double bullets when rendered
 * in a proper list structure.
 */
export function ListItemNormalizationPlugin(): null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    // Singleton guard
    if (registeredEditors.has(editor)) {
      if (import.meta.env.DEV) {
        logDevWarning('ListNormalization', 'Editor already registered, skipping duplicate registration');
      }
      return;
    }

    registeredEditors.add(editor);

    // Register transform on ListItemNode
    const unregisterTransform = editor.registerNodeTransform(ListItemNode, (node: ListItemNode) => {
      // Guard: Only process if editor is editable
      if (!editor.isEditable()) {
        return;
      }
      
      // Find the first non-code, inline TextNode (skip empty formatting nodes)
      let textNode: TextNode | null = null;
      
      function findFirstTextNode(nodeToSearch: any): TextNode | null {
        const children = nodeToSearch.getChildren();
        
        for (const child of children) {
          if ($isTextNode(child)) {
            // Found a text node - check if it has content or is just formatting
            const text = child.getTextContent();
            if (text.trim().length > 0) {
              return child;
            }
            // Skip empty text nodes (just formatting)
            continue;
          }
          
          // Descend through inline element nodes (links, inline code, formatting)
          if ($isElementNode(child) && child.isInline()) {
            const found = findFirstTextNode(child);
            if (found) {
              return found;
            }
          }
          
          // Also descend through paragraph nodes
          if ($isParagraphNode(child)) {
            const found = findFirstTextNode(child);
            if (found) {
              return found;
            }
          }
        }
        
        return null;
      }
      
      textNode = findFirstTextNode(node);
      
      // Only process if we found a text node
      if (!textNode) {
        return;
      }
      
      // Skip if this text node is in a code context
      if (shouldSkipPrefixStripping(textNode)) {
        return;
      }

      const text = textNode.getTextContent();
      const cleanedText = stripListPrefix(text);
      
      // Only update if we actually stripped a prefix (strip-once only with anchored regex)
      if (text !== cleanedText) {
        // Update the text content directly
        textNode.setTextContent(cleanedText);
        
        // Log once per prefix type in dev mode
        if (import.meta.env.DEV) {
          const prefix = text.substring(0, text.length - cleanedText.length).trim();
          const logKey = `prefix-${prefix}`;
          
          if (!warnedPrefixes.has(logKey)) {
            warnedPrefixes.add(logKey);
            logDevWarning('ListNormalization', `Stripped duplicate list prefix "${prefix}" from list item`);
          }
        }
      }
    });

    return () => {
      unregisterTransform();
      registeredEditors.delete(editor);
    };
  }, [editor]);

  return null;
}

/**
 * Utility function to clean list prefixes from plain text.
 * Can be used during paste processing if needed.
 * 
 * @deprecated Use stripListPrefix from utils/list-normalization.ts instead
 */
export function cleanListPrefixes(text: string): string {
  const lines = text.split('\n');
  return lines.map(line => stripListPrefix(line)).join('\n');
}