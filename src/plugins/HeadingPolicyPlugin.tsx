import { useEffect } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { 
  HeadingNode, 
  $createHeadingNode
} from '@lexical/rich-text';
import { LexicalEditor } from 'lexical';
import { shouldNormalizeHeadingTag } from '../constants/heading-policy';
import { logHeadingWarning } from '../utils/dev-logger';

// Singleton pattern: track registered editors to prevent duplicate registrations
const registeredEditors = new WeakSet<LexicalEditor>();

// Rate-limit warnings to once per session per message type
const warnedMessages = new Set<string>();

function logOncePerSession(message: string): void {
  if (!warnedMessages.has(message)) {
    warnedMessages.add(message);
    logHeadingWarning(message);
  }
}

/**
 * Plugin that enforces H1-H3 heading policy through a single node transform.
 * The transform is the sole enforcer - it normalizes h4-h6 to h3 after any update,
 * regardless of how the content arrived (paste, JSON load, programmatic insertion).
 * 
 * Uses singleton pattern to prevent duplicate registrations across
 * React StrictMode, hot reload, and feature toggles.
 */
export function HeadingPolicyPlugin(): null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    // Singleton guard: prevent duplicate registrations
    if (registeredEditors.has(editor)) {
      if (import.meta.env.DEV) {
        console.warn('[HeadingPolicy] Editor already registered, skipping duplicate registration');
      }
      return;
    }

    // Mark editor as registered
    registeredEditors.add(editor);

    // Node transform: the ONLY policy enforcement point
    const unregisterTransform = editor.registerNodeTransform(HeadingNode, (node) => {
      // Guard: Only transform if editor is editable
      if (!editor.isEditable()) {
        return;
      }
      
      const tag = node.getTag();
      
      // Idempotence: early return for h1-h3 (already allowed)
      if (!shouldNormalizeHeadingTag(tag)) {
        return;
      }
      
      // Transform disallowed headings (h4-h6) to h3
      // Create replacement node
      const newNode = $createHeadingNode('h3');
      
      // CRITICAL: Preserve all content and attributes
      newNode.setFormat(node.getFormat());
      newNode.setIndent(node.getIndent());
      newNode.setDirection(node.getDirection());
      
      // Create stable snapshot of children before moving them
      const children = [...node.getChildren()];
      
      // Move children to preserve text and inline formatting
      children.forEach(child => {
        // Detach from original node first, then append to new node
        child.remove();
        newNode.append(child);
      });
      
      // Replace in tree (atomic operation)
      node.replace(newNode);
      
      logOncePerSession(`[HeadingPolicy] Normalized ${tag} heading to h3 to maintain consistency`);
    });

    return () => {
      unregisterTransform();
      // Remove from registry on cleanup
      registeredEditors.delete(editor);
    };
  }, [editor]);

  return null;
}