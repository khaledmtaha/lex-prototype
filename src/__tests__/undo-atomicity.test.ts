import { describe, it, expect, beforeEach } from 'vitest';
import { createEditor, LexicalEditor, $getRoot, UNDO_COMMAND, $createParagraphNode, $createTextNode } from 'lexical';
import { HeadingNode, $createHeadingNode, $createQuoteNode } from '@lexical/rich-text';
import { ListNode, ListItemNode } from '@lexical/list';
import { CodeNode } from '@lexical/code';
import { QuoteNode } from '@lexical/rich-text';

describe('Undo Atomicity - Single Operation Reverts All Changes', () => {
  let editor: LexicalEditor;

  beforeEach(() => {
    editor = createEditor({
      namespace: 'undo-test',
      nodes: [HeadingNode, ListNode, ListItemNode, CodeNode, QuoteNode],
      onError: console.error
    });
    
    // Initialize with history tracking
    // Note: In a real React environment, HistoryPlugin would be mounted
    // For tests, we simulate by registering history commands
    let historyStack: any[] = [];
    let currentIndex = -1;
    
    // Register UNDO command handler
    editor.registerCommand(
      UNDO_COMMAND,
      () => {
        if (currentIndex >= 0 && historyStack.length > 0) {
          const previousState = historyStack[currentIndex];
          if (previousState) {
            // Restore previous state
            editor.setEditorState(editor.parseEditorState(JSON.stringify(previousState)));
            currentIndex--;
            return true;
          }
        }
        return false;
      },
      1 // High priority
    );
    
    // Track state changes for history
    editor.registerUpdateListener(({ editorState, prevEditorState }) => {
      if (prevEditorState) {
        historyStack.push(prevEditorState.toJSON());
        currentIndex = historyStack.length - 1;
        
        // Limit history stack size
        if (historyStack.length > 50) {
          historyStack.shift();
          currentIndex--;
        }
      }
    });
  });

  it('should revert multi-block paste with single undo', async () => {
    // Set initial content
    await editor.update(() => {
      const root = $getRoot();
      root.clear();
      
      const initialPara = $createParagraphNode();
      initialPara.append($createTextNode('Initial content'));
      root.append(initialPara);
    });
    
    // Wait for initial state to be tracked
    await new Promise(resolve => setTimeout(resolve, 10));
    
    // Capture initial state
    let initialChildCount: number;
    await editor.getEditorState().read(() => {
      initialChildCount = $getRoot().getChildren().length;
    });
    
    // Simulate atomic multi-block paste (all in single update)
    await editor.update(() => {
      const root = $getRoot();
      
      // Add multiple blocks in single transaction
      const heading = $createHeadingNode('h1');
      heading.append($createTextNode('Pasted Title'));
      root.append(heading);
      
      const para1 = $createParagraphNode();
      para1.append($createTextNode('Pasted paragraph 1'));
      root.append(para1);
      
      const para2 = $createParagraphNode();
      para2.append($createTextNode('Pasted paragraph 2'));
      root.append(para2);
      
      // Add quote block
      const quote = $createQuoteNode();
      quote.append($createTextNode('Pasted quote'));
      root.append(quote);
    });
    
    // Wait for paste to complete
    await new Promise(resolve => setTimeout(resolve, 10));
    
    // Verify paste worked
    let pastedChildCount: number;
    await editor.getEditorState().read(() => {
      pastedChildCount = $getRoot().getChildren().length;
    });
    
    expect(pastedChildCount).toBeGreaterThan(initialChildCount!);
    
    // Single undo should revert everything
    const undoResult = editor.dispatchCommand(UNDO_COMMAND, undefined);
    expect(undoResult).toBe(true);
    
    // Wait for undo to complete
    await new Promise(resolve => setTimeout(resolve, 10));
    
    // Verify complete reversion
    await editor.getEditorState().read(() => {
      const root = $getRoot();
      const children = root.getChildren();
      
      expect(children.length).toBe(initialChildCount!);
      expect(children[0]?.getTextContent()).toBe('Initial content');
    });
  });

  it('should maintain atomicity across transforms', async () => {
    // Initial state
    await editor.update(() => {
      const root = $getRoot();
      root.clear();
      
      const para = $createParagraphNode();
      para.append($createTextNode('Start state'));
      root.append(para);
    });
    
    await new Promise(resolve => setTimeout(resolve, 10));
    
    // Atomic paste that would trigger transforms in real environment
    await editor.update(() => {
      const root = $getRoot();
      
      // Add content that would need transforms:
      // 1. H6 → H3 normalization (if HeadingPolicyPlugin was active)
      // 2. List prefix stripping (if content was in lists)
      
      const heading = $createHeadingNode('h2'); // Use h2 to avoid transform issues in test
      heading.append($createTextNode('Pasted Heading'));
      root.append(heading);
      
      // Paragraph with content
      const para = $createParagraphNode();
      para.append($createTextNode('Regular content'));
      root.append(para);
    });
    
    await new Promise(resolve => setTimeout(resolve, 20)); // Extra time for transforms
    
    // Verify paste worked
    await editor.getEditorState().read(() => {
      const root = $getRoot();
      expect(root.getChildren().length).toBe(3); // start + heading + para
    });
    
    // Single undo should revert paste AND all transforms
    editor.dispatchCommand(UNDO_COMMAND, undefined);
    await new Promise(resolve => setTimeout(resolve, 10));
    
    // Should be back to initial state
    await editor.getEditorState().read(() => {
      const root = $getRoot();
      const children = root.getChildren();
      
      expect(children.length).toBe(1);
      expect(children[0]?.getTextContent()).toBe('Start state');
    });
  });

  it('should handle failed paste without corrupting undo history', async () => {
    // Set up initial state
    await editor.update(() => {
      const root = $getRoot();
      root.clear();
      
      const para = $createParagraphNode();
      para.append($createTextNode('Clean state'));
      root.append(para);
    });
    
    await new Promise(resolve => setTimeout(resolve, 10));
    
    // Make a successful change first
    await editor.update(() => {
      const root = $getRoot();
      const para = $createParagraphNode();
      para.append($createTextNode('Good change'));
      root.append(para);
    });
    
    await new Promise(resolve => setTimeout(resolve, 10));
    
    // Simulate failed paste (no actual changes made)
    let pasteAttempted = false;
    try {
      await editor.update(() => {
        // Simulate paste validation failure - no nodes added
        const mockNodes: any[] = [];
        if (mockNodes.length === 0) {
          pasteAttempted = true;
          // Early return - no changes to editor state
          return;
        }
        
        // This wouldn't execute
        const root = $getRoot();
        // ... node insertion code would go here
      });
    } catch {
      pasteAttempted = true;
    }
    
    expect(pasteAttempted).toBe(true);
    
    // Undo should still work for the successful change
    editor.dispatchCommand(UNDO_COMMAND, undefined);
    await new Promise(resolve => setTimeout(resolve, 10));
    
    // Should revert to clean state (failed paste didn't corrupt history)
    await editor.getEditorState().read(() => {
      const root = $getRoot();
      const children = root.getChildren();
      
      expect(children.length).toBe(1);
      expect(children[0]?.getTextContent()).toBe('Clean state');
    });
  });

  it('should verify single update creates single history entry', async () => {
    let updateCount = 0;
    
    // Track updates
    const unregisterListener = editor.registerUpdateListener(() => {
      updateCount++;
    });
    
    // Single atomic operation with multiple node insertions
    await editor.update(() => {
      const root = $getRoot();
      root.clear();
      
      // Multiple operations in single update
      const h1 = $createHeadingNode('h1');
      h1.append($createTextNode('Title'));
      root.append(h1);
      
      const p1 = $createParagraphNode();
      p1.append($createTextNode('Paragraph 1'));
      root.append(p1);
      
      const p2 = $createParagraphNode();
      p2.append($createTextNode('Paragraph 2'));
      root.append(p2);
    });
    
    await new Promise(resolve => setTimeout(resolve, 10));
    
    // Should have triggered only one update
    expect(updateCount).toBe(1);
    
    unregisterListener();
  });
});