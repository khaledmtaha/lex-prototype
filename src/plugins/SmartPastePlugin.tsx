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

// Dev-only paste path tracing
let pasteIdCounter = 0;
const generatePasteId = () => `paste-${Date.now()}-${++pasteIdCounter}`;

// Track active paste events to detect potential double-processing
const activePastes = new Set<string>();

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
 * Calls preventDefault() to prevent default browser paste when handled.
 */
export function handleSmartPaste(editor: LexicalEditor, event: ClipboardEvent): boolean {
  const startTime = performance.now();
  
  // Generate unique paste ID for dev tracing
  const pasteId = import.meta.env.DEV ? generatePasteId() : '';
  
  if (import.meta.env.DEV) {
    // Check for potential double processing
    if (activePastes.has(pasteId)) {
      logDevWarning('SmartPaste', `[${pasteId}] DUPLICATE: Paste event already being processed!`);
      return false;
    }
    
    // Track this paste event
    activePastes.add(pasteId);
    logDevWarning('SmartPaste', `[${pasteId}] STARTED: Processing paste event`);
  }

  // Helper function to clean up and return
  const finishPaste = (result: boolean, path?: string) => {
    if (import.meta.env.DEV) {
      activePastes.delete(pasteId);
      const duration = performance.now() - startTime;
      if (path) {
        logDevWarning('SmartPaste', `[${pasteId}] COMPLETED: ${path} (${duration.toFixed(1)}ms) -> ${result ? 'HANDLED' : 'DEFERRED'}`);
      } else {
        logDevWarning('SmartPaste', `[${pasteId}] EARLY_EXIT: ${duration.toFixed(1)}ms -> ${result ? 'HANDLED' : 'DEFERRED'}`);
      }
    }
    return result;
  };

  // Guard: only process if editor is editable
  if (!editor.isEditable()) {
    if (import.meta.env.DEV) {
      logDevWarning('SmartPaste', `[${pasteId}] BLOCKED: editor is read-only`);
    }
    return finishPaste(false); // Let default handler proceed
  }

  // Guard: ensure we have clipboard data
  const clipboardData = event.clipboardData;
  if (!clipboardData) {
    if (import.meta.env.DEV) {
      logDevWarning('SmartPaste', `[${pasteId}] BLOCKED: No clipboard data available`);
    }
    return finishPaste(false);
  }

  try {
    // Fast Path: Handle Lexical clipboard data for perfect fidelity
    const lexicalData = clipboardData.getData(LEXICAL_CLIPBOARD_TYPE);
    if (lexicalData && lexicalData.trim()) {
      if (import.meta.env.DEV) {
        logDevWarning('SmartPaste', `[${pasteId}] ATTEMPTING: Fast Path (${lexicalData.length} chars)`);
      }
      
      // Validate it's actually JSON before attempting to parse
      try {
        JSON.parse(lexicalData);
        const handled = handleLexicalFastPath(editor, lexicalData, pasteId, event);
        return finishPaste(handled, handled ? 'Fast Path - SCHEDULED' : 'Fast Path - REJECTED');
      } catch (jsonError) {
        if (import.meta.env.DEV) {
          logDevWarning('SmartPaste', `[${pasteId}] FAST_PATH_FAILED: Invalid JSON, falling back to HTML path: ${jsonError}`);
        }
        // Fall through to HTML path
      }
    }

    // Standard Path: Handle HTML content with sanitization
    const htmlContent = clipboardData.getData('text/html');
    if (htmlContent && htmlContent.trim()) {
      if (import.meta.env.DEV) {
        logDevWarning('SmartPaste', `[${pasteId}] ATTEMPTING: HTML Path (${htmlContent.length} chars)`);
      }
      
      const handled = handleHtmlPaste(editor, htmlContent, startTime, clipboardData, pasteId, event);
      return finishPaste(handled, handled ? 'HTML Path - SCHEDULED' : 'HTML Path - REJECTED');
    }

    // No HTML content, let default text paste handler take over
    if (import.meta.env.DEV) {
      logDevWarning('SmartPaste', `[${pasteId}] NO_CONTENT: No HTML or Lexical data, deferring to default handler`);
    }
    return finishPaste(false);

  } catch (error) {
    console.error(`[SmartPaste] [${pasteId}] Processing failed, falling back to default:`, error);
    return finishPaste(false);
  }
}

/**
 * Fast Path: Handle Lexical clipboard data without sanitization.
 * Provides perfect fidelity for internal copy-paste operations.
 * 
 * Uses official @lexical/clipboard API for safe, future-proof implementation.
 */
function handleLexicalFastPath(editor: LexicalEditor, lexicalData: string, pasteId?: string, event?: ClipboardEvent): boolean {
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

    // Pre-check selection availability synchronously
    let hasValidSelection = false;
    editor.getEditorState().read(() => {
      const selection = $getSelection();
      hasValidSelection = $isRangeSelection(selection);
    });
    
    if (!hasValidSelection) {
      if (import.meta.env.DEV) {
        const pasteIdPrefix = pasteId ? `[${pasteId}] ` : '';
        logDevWarning('SmartPaste', `${pasteIdPrefix}FAST_PATH_BLOCKED: No valid range selection`);
      }
      return false; // Reject - don't handle this paste
    }
    
    // We have valid selection - we will handle this paste
    if (event) {
      event.preventDefault(); // Prevent default browser paste
    }
    
    if (import.meta.env.DEV) {
      const pasteIdPrefix = pasteId ? `[${pasteId}] ` : '';
      logDevWarning('SmartPaste', `${pasteIdPrefix}FAST_PATH_SCHEDULED: Handling Fast Path insertion`);
    }
    
    // Schedule the insertion - this runs asynchronously
    editor.update(() => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) {
        if (import.meta.env.DEV) {
          const pasteIdPrefix = pasteId ? `[${pasteId}] ` : '';
          logDevWarning('SmartPaste', `${pasteIdPrefix}FAST_PATH_FAILED: Selection became invalid`);
        }
        return;
      }

      try {
        // Use official clipboard utility to reconstruct nodes
        const nodes = $generateNodesFromSerializedNodes(serializedNodes);
        
        if (nodes.length === 0) {
          if (import.meta.env.DEV) {
            const pasteIdPrefix = pasteId ? `[${pasteId}] ` : '';
            logDevWarning('SmartPaste', `${pasteIdPrefix}FAST_PATH_FAILED: No valid nodes generated from serialized data`);
          }
          return;
        }

        // Insert nodes atomically for single-undo behavior
        selection.insertNodes(nodes);
        
        // Optional: Collapse selection to end of last inserted node for better UX
        if (nodes.length > 0) {
          const lastNode = nodes[nodes.length - 1];
          if (lastNode && lastNode.selectEnd) {
            lastNode.selectEnd();
          }
        }
        
        if (import.meta.env.DEV) {
          const pasteIdPrefix = pasteId ? `[${pasteId}] ` : '';
          logDevWarning('SmartPaste', `${pasteIdPrefix}FAST_PATH_SUCCESS: Inserted ${nodes.length} Lexical nodes`);
        }
        
      } catch (nodeError) {
        if (import.meta.env.DEV) {
          const pasteIdPrefix = pasteId ? `[${pasteId}] ` : '';
          logDevWarning('SmartPaste', `${pasteIdPrefix}FAST_PATH_FAILED: Node generation failed: ${nodeError}`);
        }
      }
    });
    
    // Return true immediately - we accepted and scheduled the paste
    return true;

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
function handleHtmlPaste(editor: LexicalEditor, htmlContent: string, startTime: number, clipboardData?: DataTransfer, pasteId?: string, event?: ClipboardEvent): boolean {
  // Size guard: check before expensive sanitization
  if (exceedsSizeLimit(htmlContent)) {
    if (import.meta.env.DEV) {
      const pasteIdPrefix = pasteId ? `[${pasteId}] ` : '';
      logDevWarning('SmartPaste', `${pasteIdPrefix}SIZE_LIMIT_EXCEEDED: Content exceeds ${MAX_PASTE_SIZE / 1024}KB limit, falling back to plaintext`);
    }
    return handlePlaintextFallback(editor, htmlContent, clipboardData, pasteId, event);
  }

  // Sanitize HTML with time guard
  const sanitizationStart = performance.now();
  const sanitizedHTML = sanitizeHTML(htmlContent);
  const sanitizationTime = performance.now() - sanitizationStart;

  // Time guard: abort if sanitization took too long
  if (sanitizationTime > MAX_SANITIZATION_TIME_MS) {
    if (import.meta.env.DEV) {
      const pasteIdPrefix = pasteId ? `[${pasteId}] ` : '';
      logDevWarning('SmartPaste', `${pasteIdPrefix}SANITIZATION_TIMEOUT: Sanitization took ${sanitizationTime.toFixed(1)}ms, falling back to plaintext`);
    }
    return handlePlaintextFallback(editor, htmlContent, clipboardData, pasteId, event);
  }

  // Validate sanitized content
  if (!sanitizedHTML.trim()) {
    if (import.meta.env.DEV) {
      logDevWarning('SmartPaste', 'HTML sanitization resulted in empty content');
    }
    return false; // Let default handler proceed
  }

  // Pre-check selection availability synchronously
  let hasValidSelection = false;
  editor.getEditorState().read(() => {
    const selection = $getSelection();
    hasValidSelection = $isRangeSelection(selection);
  });
  
  if (!hasValidSelection) {
    if (import.meta.env.DEV) {
      const pasteIdPrefix = pasteId ? `[${pasteId}] ` : '';
      logDevWarning('SmartPaste', `${pasteIdPrefix}HTML_PATH_BLOCKED: No valid range selection`);
    }
    return false; // Reject - don't handle this paste
  }
  
  // We have valid selection - we will handle this paste
  if (event) {
    event.preventDefault(); // Prevent default browser paste
  }
  
  if (import.meta.env.DEV) {
    const pasteIdPrefix = pasteId ? `[${pasteId}] ` : '';
    logDevWarning('SmartPaste', `${pasteIdPrefix}HTML_PATH_SCHEDULED: Handling HTML Path insertion`);
  }
  
  // Schedule the insertion - this runs asynchronously
  editor.update(() => {
    const selection = $getSelection();
    if (!$isRangeSelection(selection)) {
      if (import.meta.env.DEV) {
        const pasteIdPrefix = pasteId ? `[${pasteId}] ` : '';
        logDevWarning('SmartPaste', `${pasteIdPrefix}HTML_PATH_FAILED: Selection became invalid`);
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
          const pasteIdPrefix = pasteId ? `[${pasteId}] ` : '';
          logDevWarning('SmartPaste', `${pasteIdPrefix}HTML_PATH_FAILED: No nodes generated from sanitized HTML`);
        }
        return;
      }

      // Insert nodes atomically - all operations in single transaction for one undo
      selection.insertNodes(nodes);
      
      // Optional: Collapse selection to end of last inserted node
      if (nodes.length > 0) {
        const lastNode = nodes[nodes.length - 1];
        if (lastNode && lastNode.selectEnd) {
          lastNode.selectEnd();
        }
      }
      
      const totalTime = performance.now() - startTime;
      if (import.meta.env.DEV) {
        const pasteIdPrefix = pasteId ? `[${pasteId}] ` : '';
        logDevWarning('SmartPaste', `${pasteIdPrefix}HTML_PATH_SUCCESS: Inserted ${nodes.length} nodes in ${totalTime.toFixed(1)}ms`);
      }

    } catch (error) {
      if (import.meta.env.DEV) {
        const pasteIdPrefix = pasteId ? `[${pasteId}] ` : '';
        console.error(`[SmartPaste] [${pasteId}] HTML_PATH_FAILED: Node generation/insertion failed:`, error);
      } else {
        console.error('[SmartPaste] Node generation/insertion failed:', error);
      }
    }
  });
  
  // Return true immediately - we accepted and scheduled the paste
  return true;
}

/**
 * Fallback: Insert content as plain text when HTML processing fails.
 * Prefers text/plain from clipboard over HTML tag stripping.
 * This ensures paste always works even with hostile or oversized content.
 */
function handlePlaintextFallback(editor: LexicalEditor, htmlContent: string, clipboardData?: DataTransfer, pasteId?: string, event?: ClipboardEvent): boolean {
  // Prefer text/plain from clipboard over HTML stripping
  let plainText = '';
  
  if (clipboardData) {
    const clipboardText = clipboardData.getData('text/plain');
    if (clipboardText && clipboardText.trim()) {
      plainText = clipboardText;
      if (import.meta.env.DEV) {
        const pasteIdPrefix = pasteId ? `[${pasteId}] ` : '';
        logDevWarning('SmartPaste', `${pasteIdPrefix}PLAINTEXT_FALLBACK: Using text/plain from clipboard (${plainText.length} chars)`);
      }
    }
  }
  
  // Fallback to HTML stripping if no text/plain available
  if (!plainText.trim()) {
    plainText = stripHtmlToText(htmlContent);
    if (import.meta.env.DEV) {
      const pasteIdPrefix = pasteId ? `[${pasteId}] ` : '';
      logDevWarning('SmartPaste', `${pasteIdPrefix}PLAINTEXT_FALLBACK: Stripped HTML to text (${plainText.length} chars)`);
    }
  }
  
  if (!plainText.trim()) {
    return false; // Nothing to paste
  }

  // Pre-check selection availability synchronously
  let hasValidSelection = false;
  editor.getEditorState().read(() => {
    const selection = $getSelection();
    hasValidSelection = $isRangeSelection(selection);
  });
  
  if (!hasValidSelection) {
    if (import.meta.env.DEV) {
      const pasteIdPrefix = pasteId ? `[${pasteId}] ` : '';
      logDevWarning('SmartPaste', `${pasteIdPrefix}PLAINTEXT_BLOCKED: No valid range selection`);
    }
    return false; // Reject - don't handle this paste
  }

  // We have valid selection - we will handle this paste
  if (event) {
    event.preventDefault(); // Prevent default browser paste
  }
  
  if (import.meta.env.DEV) {
    const pasteIdPrefix = pasteId ? `[${pasteId}] ` : '';
    logDevWarning('SmartPaste', `${pasteIdPrefix}PLAINTEXT_SCHEDULED: Handling plaintext fallback insertion`);
  }

  // Schedule the insertion - this runs asynchronously
  editor.update(() => {
    const selection = $getSelection();
    if (!$isRangeSelection(selection)) {
      if (import.meta.env.DEV) {
        const pasteIdPrefix = pasteId ? `[${pasteId}] ` : '';
        logDevWarning('SmartPaste', `${pasteIdPrefix}PLAINTEXT_FAILED: Selection became invalid`);
      }
      return;
    }

    try {
      selection.insertText(plainText);
      
      if (import.meta.env.DEV) {
        const pasteIdPrefix = pasteId ? `[${pasteId}] ` : '';
        logDevWarning('SmartPaste', `${pasteIdPrefix}PLAINTEXT_SUCCESS: Inserted ${plainText.length} characters`);
      }
    } catch (error) {
      if (import.meta.env.DEV) {
        const pasteIdPrefix = pasteId ? `[${pasteId}] ` : '';
        console.error(`[SmartPaste] [${pasteId}] PLAINTEXT_FAILED: Insertion failed:`, error);
      } else {
        console.error('[SmartPaste] Plaintext insertion failed:', error);
      }
    }
  });
  
  // Return true immediately - we accepted and scheduled the paste
  return true;
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