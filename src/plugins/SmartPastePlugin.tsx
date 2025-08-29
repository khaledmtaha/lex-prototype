import { useEffect } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { 
  LexicalEditor, 
  $getSelection, 
  $isRangeSelection,
  COMMAND_PRIORITY_HIGH,
  PASTE_COMMAND,
  SerializedEditorState,
  SerializedLexicalNode
} from 'lexical';
import { $generateNodesFromDOM } from '@lexical/html';
import { $generateNodesFromSerializedNodes } from '@lexical/clipboard';
import { sanitizeHTML, exceedsSizeLimit, MAX_PASTE_SIZE } from '../config/sanitization-config';
import { logDevWarning } from '../utils/dev-logger';

// Singleton pattern: prevent duplicate registrations
const registeredEditors = new WeakSet<LexicalEditor>();

// Track warned payload shapes to prevent log spam
const warnedShapes = new Set<string>();

/**
 * Production-hardened Smart Paste Plugin - Stage 1 of the two-stage paste pipeline.
 * 
 * Responsibilities:
 * 1. Fast Path: Handle application/x-lexical-editor MIME type for perfect fidelity
 * 2. Resilience: Size/time guards with plaintext fallback
 * 3. Security: Sanitize HTML content using hardened DOMPurify configuration
 * 4. Atomicity: Insert nodes in single transaction for proper undo behavior
 * 5. Discipline: Return true only on successful insertion
 * 
 * Stage 2 (HeadingPolicyPlugin transform) handles policy enforcement.
 */

// Performance thresholds - tuned for production use
// 150ms allows medium-sized content while preventing UI freeze
const MAX_SANITIZATION_TIME_MS = 150;
const LEXICAL_CLIPBOARD_TYPE = 'application/x-lexical-editor';
export function SmartPastePlugin(): null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    // Singleton guard: prevent duplicate registrations
    if (registeredEditors.has(editor)) {
      if (import.meta.env.DEV) {
        logDevWarning('SmartPaste', 'Editor already registered, skipping duplicate registration');
      }
      return;
    }

    // Mark editor as registered
    registeredEditors.add(editor);

    // Register paste command handler with high priority
    const unregisterPasteCommand = editor.registerCommand<ClipboardEvent>(
      PASTE_COMMAND,
      (event) => {
        return handleSmartPaste(editor, event);
      },
      COMMAND_PRIORITY_HIGH // High priority to run before other paste handlers
    );

    return () => {
      unregisterPasteCommand();
      registeredEditors.delete(editor);
    };
  }, [editor]);

  return null;
}

/**
 * Production-hardened paste handler with multiple safety layers.
 * Returns true ONLY if content was successfully inserted.
 */
function handleSmartPaste(editor: LexicalEditor, event: ClipboardEvent): boolean {
  const startTime = performance.now();

  // Guard: only process if editor is editable
  if (!editor.isEditable()) {
    if (import.meta.env.DEV) {
      logDevWarning('SmartPaste', 'Paste blocked: editor is read-only');
    }
    return false; // Let default handler proceed
  }

  // Guard: ensure we have clipboard data
  const clipboardData = event.clipboardData;
  if (!clipboardData) {
    if (import.meta.env.DEV) {
      logDevWarning('SmartPaste', 'No clipboard data available');
    }
    return false;
  }

  try {
    // Fast Path: Handle Lexical clipboard data for perfect fidelity
    const lexicalData = clipboardData.getData(LEXICAL_CLIPBOARD_TYPE);
    if (lexicalData && lexicalData.trim()) {
      // Validate it's actually JSON before attempting to parse
      try {
        JSON.parse(lexicalData);
        return handleLexicalFastPath(editor, lexicalData);
      } catch (jsonError) {
        if (import.meta.env.DEV) {
          logDevWarning('SmartPaste', `Invalid Lexical clipboard data (not JSON), falling back to HTML path: ${jsonError}`);
        }
        // Fall through to HTML path
      }
    }

    // Standard Path: Handle HTML content with sanitization
    const htmlContent = clipboardData.getData('text/html');
    if (htmlContent && htmlContent.trim()) {
      return handleHtmlPaste(editor, htmlContent, startTime);
    }

    // No HTML content, let default text paste handler take over
    return false;

  } catch (error) {
    console.error('[SmartPaste] Processing failed, falling back to default:', error);
    return false; // Let default paste handler take over
  }
}

/**
 * Fast Path: Handle Lexical clipboard data without sanitization.
 * Provides perfect fidelity for internal copy-paste operations.
 * 
 * Uses official @lexical/clipboard API for safe, future-proof implementation.
 */
function handleLexicalFastPath(editor: LexicalEditor, lexicalData: string): boolean {
  try {
    // Parse the Lexical clipboard payload
    const parsedPayload = JSON.parse(lexicalData);
    
    // Extract serialized nodes from the payload
    // The payload structure can vary, check common locations
    let serializedNodes: SerializedLexicalNode[] = [];
    
    // Probe common payload structures
    if (parsedPayload.root && parsedPayload.root.children) {
      serializedNodes = parsedPayload.root.children;
    } else if (parsedPayload.nodes) {
      serializedNodes = parsedPayload.nodes;
    } else if (Array.isArray(parsedPayload)) {
      serializedNodes = parsedPayload;
    } else if (parsedPayload.clipboard) {
      // Some environments embed payload in clipboard property
      const clipboardData = parsedPayload.clipboard;
      if (clipboardData.root && clipboardData.root.children) {
        serializedNodes = clipboardData.root.children;
      } else if (Array.isArray(clipboardData)) {
        serializedNodes = clipboardData;
      }
    } else if (parsedPayload.editorState) {
      // Some payloads have serialized editorState string
      try {
        const editorStateData = typeof parsedPayload.editorState === 'string' 
          ? JSON.parse(parsedPayload.editorState)
          : parsedPayload.editorState;
        if (editorStateData.root && editorStateData.root.children) {
          serializedNodes = editorStateData.root.children;
        }
      } catch (editorStateError) {
        if (import.meta.env.DEV) {
          logDevWarning('SmartPaste', `Fast path: Failed to parse editorState: ${editorStateError}`);
        }
      }
    }

    if (serializedNodes.length === 0) {
      if (import.meta.env.DEV) {
        // Log payload shape once for debugging unknown structures
        const shapeSignature = Object.keys(parsedPayload).sort().join(',');
        const logKey = `unknown-payload-${shapeSignature}`;
        
        if (!warnedShapes.has(logKey)) {
          warnedShapes.add(logKey);
          logDevWarning('SmartPaste', `Fast path: Unknown payload shape with keys: [${shapeSignature}]`);
        }
      }
      return false; // Fall back to HTML path
    }

    // Generate Lexical nodes from serialized data using official API - atomic operation
    let insertionSuccess = false;
    
    editor.update(() => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) {
        if (import.meta.env.DEV) {
          logDevWarning('SmartPaste', 'Fast path: No valid range selection');
        }
        return;
      }

      try {
        // Use official clipboard utility to reconstruct nodes
        const nodes = $generateNodesFromSerializedNodes(serializedNodes);
        
        if (nodes.length === 0) {
          if (import.meta.env.DEV) {
            logDevWarning('SmartPaste', 'Fast path: No valid nodes generated from serialized data');
          }
          return;
        }

        // Insert nodes atomically for single-undo behavior
        selection.insertNodes(nodes);
        
        // Optional: Collapse selection to end of last inserted node for better UX
        // This helps floating toolbar reflect the correct block type
        if (nodes.length > 0) {
          const lastNode = nodes[nodes.length - 1];
          if (lastNode && lastNode.selectEnd) {
            lastNode.selectEnd();
          }
        }
        
        insertionSuccess = true;
        
        if (import.meta.env.DEV) {
          logDevWarning('SmartPaste', `Fast path: Successfully inserted ${nodes.length} Lexical nodes`);
        }
        
      } catch (nodeError) {
        if (import.meta.env.DEV) {
          logDevWarning('SmartPaste', `Fast path: Node generation failed: ${nodeError}`);
        }
        insertionSuccess = false;
      }
    });
    
    return insertionSuccess;

  } catch (parseError) {
    if (import.meta.env.DEV) {
      logDevWarning('SmartPaste', `Fast path: JSON parsing failed: ${parseError}`);
    }
    return false; // Fall back to HTML path
  }
}

/**
 * Standard Path: Handle HTML content with sanitization and guards.
 */
function handleHtmlPaste(editor: LexicalEditor, htmlContent: string, startTime: number): boolean {
  // Size guard: check before expensive sanitization
  if (exceedsSizeLimit(htmlContent)) {
    if (import.meta.env.DEV) {
      logDevWarning('SmartPaste', `Content exceeds ${MAX_PASTE_SIZE / 1024}KB limit, falling back to plaintext`);
    }
    return handlePlaintextFallback(editor, htmlContent, clipboardData);
  }

  // Sanitize HTML with time guard
  const sanitizationStart = performance.now();
  const sanitizedHTML = sanitizeHTML(htmlContent);
  const sanitizationTime = performance.now() - sanitizationStart;

  // Time guard: abort if sanitization took too long
  if (sanitizationTime > MAX_SANITIZATION_TIME_MS) {
    if (import.meta.env.DEV) {
      logDevWarning('SmartPaste', `Sanitization took ${sanitizationTime.toFixed(1)}ms, falling back to plaintext`);
    }
    return handlePlaintextFallback(editor, htmlContent, clipboardData);
  }

  // Validate sanitized content
  if (!sanitizedHTML.trim()) {
    if (import.meta.env.DEV) {
      logDevWarning('SmartPaste', 'HTML sanitization resulted in empty content');
    }
    return false; // Let default handler proceed
  }

  // Generate and insert nodes atomically
  let insertionSuccess = false;
  
  editor.update(() => {
    const selection = $getSelection();
    if (!$isRangeSelection(selection)) {
      if (import.meta.env.DEV) {
        logDevWarning('SmartPaste', 'No valid range selection for HTML paste');
      }
      return;
    }

    try {
      // Parse sanitized HTML and generate nodes
      const parser = new DOMParser();
      const doc = parser.parseFromString(sanitizedHTML, 'text/html');
      const nodes = $generateNodesFromDOM(editor, doc);

      if (nodes.length === 0) {
        if (import.meta.env.DEV) {
          logDevWarning('SmartPaste', 'No nodes generated from sanitized HTML');
        }
        return;
      }

      // Insert nodes atomically - all operations in single transaction for one undo
      selection.insertNodes(nodes);
      
      // Optional: Collapse selection to end of last inserted node
      // This helps floating toolbar show correct block type for the last item
      if (nodes.length > 0) {
        const lastNode = nodes[nodes.length - 1];
        if (lastNode && lastNode.selectEnd) {
          lastNode.selectEnd();
        }
      }
      
      insertionSuccess = true;
      
      const totalTime = performance.now() - startTime;
      if (import.meta.env.DEV) {
        logDevWarning('SmartPaste', `HTML path: Inserted ${nodes.length} nodes in ${totalTime.toFixed(1)}ms`);
      }

    } catch (error) {
      console.error('[SmartPaste] Node generation/insertion failed:', error);
      insertionSuccess = false;
    }
  });
  
  return insertionSuccess;
}

/**
 * Fallback: Insert content as plain text when HTML processing fails.
 * Prefers text/plain from clipboard over HTML tag stripping.
 * This ensures paste always works even with hostile or oversized content.
 */
function handlePlaintextFallback(editor: LexicalEditor, htmlContent: string, clipboardData?: DataTransfer): boolean {
  // Prefer text/plain from clipboard over HTML stripping
  let plainText = '';
  
  if (clipboardData) {
    const clipboardText = clipboardData.getData('text/plain');
    if (clipboardText && clipboardText.trim()) {
      plainText = clipboardText;
      if (import.meta.env.DEV) {
        logDevWarning('SmartPaste', 'Plaintext fallback: Using text/plain from clipboard');
      }
    }
  }
  
  // Fallback to HTML stripping if no text/plain available
  if (!plainText.trim()) {
    plainText = stripHtmlToText(htmlContent);
    if (import.meta.env.DEV) {
      logDevWarning('SmartPaste', 'Plaintext fallback: Stripped HTML to text');
    }
  }
  
  if (!plainText.trim()) {
    return false; // Nothing to paste
  }

  let insertionSuccess = false;
  
  editor.update(() => {
    const selection = $getSelection();
    if (!$isRangeSelection(selection)) {
      return;
    }

    try {
      selection.insertText(plainText);
      insertionSuccess = true;
      
      if (import.meta.env.DEV) {
        logDevWarning('SmartPaste', `Plaintext fallback: Inserted ${plainText.length} characters`);
      }
    } catch (error) {
      console.error('[SmartPaste] Plaintext insertion failed:', error);
      insertionSuccess = false;
    }
  });
  
  return insertionSuccess;
}

/**
 * Strip HTML tags and decode entities to extract plain text.
 */
function stripHtmlToText(html: string): string {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    return doc.body.textContent || doc.body.innerText || '';
  } catch {
    // Fallback: basic HTML tag removal
    return html.replace(/<[^>]*>/g, '').trim();
  }
}


/**
 * Feature flag check for Smart Paste.
 * Can be used to gradually roll out or quickly disable the feature.
 */
export function isSmartPasteEnabled(): boolean {
  // For now, always enabled. Can be connected to feature flags later.
  // Example: return window.featureFlags?.smartPaste ?? true;
  return true;
}

/**
 * Kill switch for Smart Paste.
 * Emergency fallback to disable Smart Paste completely.
 */
export function isSmartPasteKillSwitchActive(): boolean {
  // Example: return window.killSwitches?.smartPaste ?? false;
  return false;
}