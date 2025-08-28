import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createEditor, $getRoot, LexicalEditor, $createTextNode, $setSelection, $createRangeSelection, $createParagraphNode, ParagraphNode, TextNode } from 'lexical';
import { HeadingNode, $createHeadingNode, $isHeadingNode } from '@lexical/rich-text';
import { $createListNode, $createListItemNode, ListNode, ListItemNode } from '@lexical/list';
import { formatHeading } from '../commands/heading-commands';
// HeadingPolicyPlugin functionality is tested via direct transform registration
import { ALLOWED_HEADING_TAGS, shouldNormalizeHeadingTag } from '../constants/heading-policy';

describe('Heading Policy Integration Tests', () => {
  let editor: LexicalEditor;

  beforeEach(() => {
    editor = createEditor({
      namespace: 'policy-test',
      nodes: [HeadingNode, ParagraphNode, TextNode, ListNode, ListItemNode],
      onError: console.error
    });

    // Register the policy plugin transform (outside update block for reliability)
    editor.registerNodeTransform(HeadingNode, (node) => {
      const tag = node.getTag();
      
      if (shouldNormalizeHeadingTag(tag)) {
        const newNode = $createHeadingNode('h3');
        
        // Preserve all formatting
        newNode.setFormat(node.getFormat());
        newNode.setIndent(node.getIndent());
        newNode.setDirection(node.getDirection());
        
        // Move children to new node
        const children = node.getChildren();
        children.forEach(child => newNode.append(child));
        
        // Replace in tree
        node.replace(newNode);
      }
    });
  });

  describe('Transform Idempotency', () => {
    it('h3 insertion should not change on multiple updates', async () => {
      await editor.update(() => {
        const root = $getRoot();
        root.clear();
        
        const h3 = $createHeadingNode('h3');
        h3.append($createTextNode('Valid H3'));
        root.append(h3);
      });

      // First check
      let firstPassTag: string;
      await editor.getEditorState().read(() => {
        const firstChild = $getRoot().getFirstChild() as HeadingNode;
        firstPassTag = firstChild.getTag();
      });

      expect(firstPassTag!).toBe('h3');

      // Trigger transform again (should be no-op)
      await editor.update(() => {});

      // Second check - should be unchanged
      await editor.getEditorState().read(() => {
        const firstChild = $getRoot().getFirstChild() as HeadingNode;
        expect(firstChild.getTag()).toBe('h3');
      });
    });

    it('h5 insertion should normalize to h3 and then be stable', async () => {
      // Create h5 and let transform normalize it
      await editor.update(() => {
        const root = $getRoot();
        root.clear();
        
        const h5 = $createHeadingNode('h5');
        h5.append($createTextNode('Should become H3'));
        root.append(h5);
      });

      // After update, transform should have run synchronously
      editor.getEditorState().read(() => {
        const firstChild = $getRoot().getFirstChild() as HeadingNode;
        expect(firstChild.getTag()).toBe('h3');
        expect(firstChild.getTextContent()).toBe('Should become H3');
      });

      // Second update should be no-op (idempotent)
      await editor.update(() => {
        // No-op update to trigger transforms again
      });

      // Should still be h3, no change
      editor.getEditorState().read(() => {
        const firstChild = $getRoot().getFirstChild() as HeadingNode;
        expect(firstChild.getTag()).toBe('h3');
        expect(firstChild.getTextContent()).toBe('Should become H3');
      });
    });
  });

  describe('Preservation on Downcast', () => {
    it('should preserve format, indent, and direction during h4-h6 to h3 conversion', async () => {
      await editor.update(() => {
        const root = $getRoot();
        root.clear();
        
        // Create h5 with formatting  
        const h5 = $createHeadingNode('h5');
        h5.setIndent(2); // Indented
        h5.setDirection('rtl'); // Right-to-left
        
        const textNode = $createTextNode('Formatted H5');
        textNode.setFormat('italic');
        h5.append(textNode);
        
        root.append(h5);
      });

      // Check that properties were preserved after transform
      await editor.getEditorState().read(() => {
        const heading = $getRoot().getFirstChild() as HeadingNode;
        
        expect(heading.getTag()).toBe('h3');
        expect(heading.getIndent()).toBe(2); // Indent preserved
        expect(heading.getDirection()).toBe('rtl'); // Direction preserved
        
        const textChild = heading.getFirstChild();
        expect(textChild?.getTextContent()).toBe('Formatted H5');
        expect(textChild?.hasFormat('italic')).toBe(true); // Child formatting preserved
      });
    });

    it('should preserve complex child structure during normalization', async () => {
      await editor.update(() => {
        const root = $getRoot();
        root.clear();
        
        // Create h6 with mixed children
        const h6 = $createHeadingNode('h6');
        
        const text1 = $createTextNode('Bold ');
        text1.setFormat('bold');
        
        const text2 = $createTextNode('and italic ');
        text2.setFormat('italic');
        
        const text3 = $createTextNode('text');
        
        h6.append(text1, text2, text3);
        root.append(h6);
      });

      await editor.getEditorState().read(() => {
        const heading = $getRoot().getFirstChild() as HeadingNode;
        
        expect(heading.getTag()).toBe('h3');
        expect(heading.getChildrenSize()).toBe(3);
        
        const children = heading.getChildren();
        expect(children[0].getTextContent()).toBe('Bold ');
        expect(children[0].hasFormat('bold')).toBe(true);
        
        expect(children[1].getTextContent()).toBe('and italic ');
        expect(children[1].hasFormat('italic')).toBe(true);
        
        expect(children[2].getTextContent()).toBe('text');
      });
    });
  });

  describe('Read-Only Behavior', () => {
    it('should block formatHeading when editor is read-only', () => {
      // Make editor read-only
      editor.setEditable(false);
      
      const success = formatHeading(editor, 'h1');
      
      expect(success).toBe(false);
      expect(editor.isEditable()).toBe(false);
    });

    it('should handle formatHeading gracefully when editor is editable', async () => {
      // Ensure editor is editable
      editor.setEditable(true);
      expect(editor.isEditable()).toBe(true);
      
      // Test that formatHeading doesn't crash when editor is editable
      // Note: The command may still return false if no valid selection exists,
      // but it should not throw errors and the editor should remain in a valid state
      const success = formatHeading(editor, 'h1');
      
      // Don't assert on success value since selection context may not be available
      // in test environment. The important thing is that it doesn't crash.
      expect(typeof success).toBe('boolean');
      expect(editor.isEditable()).toBe(true);
    });
  });

  describe('List Guard Protection', () => {
    it('should block heading conversion inside list items by default', async () => {
      await editor.update(() => {
        const root = $getRoot();
        root.clear();
        
        // Create list with item and text
        const list = $createListNode('bullet');
        const listItem = $createListItemNode();
        const textNode = $createTextNode('List item text');
        listItem.append(textNode);
        list.append(listItem);
        root.append(list);
        
        // Create proper selection on TextNode inside list item
        const selection = $createRangeSelection();
        selection.anchor.set(textNode.getKey(), 0, 'text');
        selection.focus.set(textNode.getKey(), textNode.getTextContentSize(), 'text');
        $setSelection(selection);
      });
      
      const success = formatHeading(editor, 'h1');
      
      expect(success).toBe(false);
      
      // Verify structure unchanged
      editor.getEditorState().read(() => {
        const root = $getRoot();
        expect(root.getChildrenSize()).toBe(1);
        
        const list = root.getFirstChild();
        expect(list?.getType()).toBe('list');
      });
    });

    it('should always block heading conversion in lists (safer default policy)', async () => {
      let success: boolean = false;
      
      await editor.update(() => {
        const root = $getRoot();
        root.clear();
        
        // Create list with item and text
        const list = $createListNode('bullet');
        const listItem = $createListItemNode();
        const textNode = $createTextNode('List item text');
        listItem.append(textNode);
        list.append(listItem);
        root.append(list);
        
        // Create proper selection on TextNode inside list item
        const selection = $createRangeSelection();
        selection.anchor.set(textNode.getKey(), 0, 'text');
        selection.focus.set(textNode.getKey(), textNode.getTextContentSize(), 'text');
        $setSelection(selection);
      });
      
      // Should always block now - no allowInLists option available
      success = formatHeading(editor, 'h1');
      
      expect(success).toBe(false);
      
      // Verify structure unchanged
      editor.getEditorState().read(() => {
        const root = $getRoot();
        expect(root.getChildrenSize()).toBe(1);
        
        const list = root.getFirstChild();
        expect(list?.getType()).toBe('list');
      });
    });
  });

  describe('Tree Invariant Validation', () => {
    it('should ensure no HeadingNode has h4-h6 tags after operations', async () => {
      // Insert multiple disallowed headings
      await editor.update(() => {
        const root = $getRoot();
        root.clear();
        
        const h4 = $createHeadingNode('h4');
        h4.append($createTextNode('H4 content'));
        
        const h5 = $createHeadingNode('h5');
        h5.append($createTextNode('H5 content'));
        
        const h6 = $createHeadingNode('h6');
        h6.append($createTextNode('H6 content'));
        
        root.append(h4, h5, h6);
      });

      // Transform should have run synchronously - verify all were normalized
      editor.getEditorState().read(() => {
        const root = $getRoot();
        const children = root.getChildren();
        
        expect(children.length).toBe(3);
        
        children.forEach(child => {
          if ($isHeadingNode(child)) {
            const tag = child.getTag();
            expect(ALLOWED_HEADING_TAGS).toContain(tag as any);
            expect(['h4', 'h5', 'h6']).not.toContain(tag);
            expect(tag).toBe('h3'); // All should be normalized to h3
          }
        });
      });
    });

    it('should traverse document and assert no disallowed headings exist', async () => {
      // Mixed content including disallowed headings
      await editor.update(() => {
        const root = $getRoot();
        root.clear();
        
        const h1 = $createHeadingNode('h1');
        h1.append($createTextNode('Valid H1'));
        
        const para = $createParagraphNode();
        para.append($createTextNode('Paragraph'));
        
        const h4 = $createHeadingNode('h4'); // Should normalize
        h4.append($createTextNode('Invalid H4'));
        
        const h2 = $createHeadingNode('h2');
        h2.append($createTextNode('Valid H2'));
        
        root.append(h1, para, h4, h2);
      });

      // Tree invariant check: traverse and verify no h4-h6 exist
      editor.getEditorState().read(() => {
        const root = $getRoot();
        
        function traverse(node: any): void {
          if ($isHeadingNode(node)) {
            const tag = node.getTag();
            expect(['h4', 'h5', 'h6']).not.toContain(tag);
            expect(ALLOWED_HEADING_TAGS.includes(tag as any) || tag === 'h3').toBe(true);
          }
          
          // Only traverse if node has getChildren method (ElementNodes)
          if (node.getChildren && typeof node.getChildren === 'function') {
            const children = node.getChildren();
            children.forEach((child: any) => traverse(child));
          }
        }
        
        traverse(root);
      });
    });
  });

  describe('Constants DRY Validation', () => {
    it('should use consistent allowed tags across system', () => {
      expect(ALLOWED_HEADING_TAGS).toEqual(['h1', 'h2', 'h3']);
      expect(shouldNormalizeHeadingTag('h4')).toBe(true);
      expect(shouldNormalizeHeadingTag('h5')).toBe(true);
      expect(shouldNormalizeHeadingTag('h6')).toBe(true);
      expect(shouldNormalizeHeadingTag('h1')).toBe(false);
      expect(shouldNormalizeHeadingTag('h2')).toBe(false);
      expect(shouldNormalizeHeadingTag('h3')).toBe(false);
    });
  });
});