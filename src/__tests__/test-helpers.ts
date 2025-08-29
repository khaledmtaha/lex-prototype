import { createEditor, LexicalEditor, ParagraphNode, TextNode } from 'lexical';
import { HeadingNode, QuoteNode } from '@lexical/rich-text';
import { ListNode, ListItemNode } from '@lexical/list';
import { CodeNode } from '@lexical/code';
import type { Klass, LexicalNode } from 'lexical';

/**
 * Creates a test editor with all required nodes to prevent ArtificialNode errors
 */
export function createTestEditor(options: {
  namespace?: string;
  nodes?: Klass<LexicalNode>[];
  onError?: (error: Error) => void;
  editable?: boolean;
} = {}): LexicalEditor {
  const {
    namespace = 'test-editor',
    nodes = [],
    onError = console.error,
    editable = true
  } = options;
  
  // Always include these base nodes to prevent ArtificialNode errors
  const baseNodes: Klass<LexicalNode>[] = [
    ParagraphNode,
    TextNode,
    HeadingNode,
    ListNode,
    ListItemNode,
    QuoteNode,
    CodeNode
  ];
  
  // Merge with any additional nodes, avoiding duplicates
  const allNodes = [...new Set([...baseNodes, ...nodes])];
  
  const editor = createEditor({
    namespace,
    nodes: allNodes,
    onError
  });
  
  if (!editable) {
    editor.setEditable(false);
  }
  
  return editor;
}

/**
 * Mounts plugins on a test editor
 */
export async function mountPlugins(
  editor: LexicalEditor,
  plugins: {
    smartPaste?: boolean;
    headingPolicy?: boolean;
    listItemNormalization?: boolean;
  }
): Promise<() => void> {
  const cleanupFunctions: Array<() => void> = [];
  
  if (plugins.smartPaste) {
    // Import and register SmartPastePlugin logic
    const { PASTE_COMMAND, COMMAND_PRIORITY_HIGH } = await import('lexical');
    const SmartPasteModule = await import('../plugins/SmartPastePlugin');
    
    const unregister = editor.registerCommand(
      PASTE_COMMAND,
      (event: ClipboardEvent) => {
        // Use the exported handler
        return SmartPasteModule.handleSmartPaste(editor, event);
      },
      COMMAND_PRIORITY_HIGH
    );
    
    cleanupFunctions.push(unregister);
  }
  
  if (plugins.headingPolicy) {
    const { $createHeadingNode } = await import('@lexical/rich-text');
    const { HeadingNode } = await import('@lexical/rich-text');
    
    const unregister = editor.registerNodeTransform(HeadingNode, (node) => {
      if (!editor.isEditable()) return;
      
      const tag = node.getTag();
      if (tag === 'h4' || tag === 'h5' || tag === 'h6') {
        const newNode = $createHeadingNode('h3');
        newNode.setFormat(node.getFormat());
        newNode.setIndent(node.getIndent());
        newNode.setDirection(node.getDirection());
        
        const children = [...node.getChildren()];
        children.forEach(child => {
          child.remove();
          newNode.append(child);
        });
        
        node.replace(newNode);
      }
    });
    
    cleanupFunctions.push(unregister);
  }
  
  if (plugins.listItemNormalization) {
    // Already implemented in production-edge-cases.test.ts
    // Could extract that logic here
  }
  
  // Return cleanup function
  return () => {
    cleanupFunctions.forEach(cleanup => cleanup());
  };
}

/**
 * Creates a mock clipboard event with proper DataTransfer
 */
export function createMockPasteEvent(data: {
  html?: string;
  text?: string;
  lexical?: string;
}): ClipboardEvent {
  const mockClipboardData = {
    getData: (type: string) => {
      if (type === 'text/html' && data.html) return data.html;
      if (type === 'text/plain' && data.text) return data.text;
      if (type === 'application/x-lexical-editor' && data.lexical) return data.lexical;
      return '';
    },
    setData: () => {},
    items: [],
    types: []
  } as unknown as DataTransfer;
  
  return {
    clipboardData: mockClipboardData,
    preventDefault: () => {},
    stopPropagation: () => {},
    type: 'paste'
  } as ClipboardEvent;
}

/**
 * Helper to insert HTML content and wait for transforms
 */
export async function insertAndWait(
  editor: LexicalEditor,
  updateFn: () => void,
  waitMs: number = 10
): Promise<void> {
  await editor.update(updateFn);
  // Allow transforms to run
  await new Promise(resolve => setTimeout(resolve, waitMs));
}

/**
 * Helper to create an editor with initial selection ready for paste
 */
export async function prepareEditorForPaste(editor: LexicalEditor): Promise<void> {
  const { $getRoot, $createParagraphNode, $createTextNode, $setSelection, $createRangeSelection } = await import('lexical');
  
  await editor.update(() => {
    const root = $getRoot();
    root.clear();
    
    // Create a paragraph with text
    const paragraph = $createParagraphNode();
    const text = $createTextNode('Type here...');
    paragraph.append(text);
    root.append(paragraph);
    
    // Create and set a range selection
    const selection = $createRangeSelection();
    selection.anchor.set(text.getKey(), 0, 'text');
    selection.focus.set(text.getKey(), text.getTextContent().length, 'text');
    $setSelection(selection);
  });
}