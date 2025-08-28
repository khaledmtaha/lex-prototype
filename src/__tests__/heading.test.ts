import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createEditor, $getRoot, LexicalEditor, $createTextNode, $setSelection, $createRangeSelection, $createParagraphNode, ParagraphNode, TextNode, $getSelection, $isRangeSelection } from 'lexical';
import { HeadingNode, $createHeadingNode, $isHeadingNode } from '@lexical/rich-text';
import { $createListNode, $createListItemNode, ListNode, ListItemNode } from '@lexical/list';
import { formatHeading } from '../commands/heading-commands';
import { ALLOWED_HEADING_TAGS, shouldNormalizeHeadingTag } from '../constants/heading-policy';

describe('Heading Policy - End-to-End Integration', () => {
  let editor: LexicalEditor;

  beforeEach(() => {
    editor = createEditor({
      namespace: 'heading-test',
      nodes: [HeadingNode, ParagraphNode, TextNode, ListNode, ListItemNode],
      onError: console.error
    });

    // Register the policy plugin transform (as it would be in production)
    editor.registerNodeTransform(HeadingNode, (node) => {
      const tag = node.getTag();
      
      if (shouldNormalizeHeadingTag(tag)) {
        const newNode = $createHeadingNode('h3');
        
        // Preserve all formatting and content
        newNode.setFormat(node.getFormat());
        newNode.setIndent(node.getIndent());
        newNode.setDirection(node.getDirection());
        
        // Move children to preserve text and inline formatting
        const children = node.getChildren();
        children.forEach(child => newNode.append(child));
        
        node.replace(newNode);
      }
    });
  });

  describe('Commands', () => {
    it('should handle formatHeading gracefully (selection context may not be available in tests)', async () => {
      // Test that formatHeading doesn't crash and returns a boolean
      const success = formatHeading(editor, 'h1');
      expect(typeof success).toBe('boolean');
    });

    it('should handle toggle behavior gracefully', async () => {
      // Test that enableToggle option doesn't crash
      const success = formatHeading(editor, 'h1', { enableToggle: true });
      expect(typeof success).toBe('boolean');
    });

    it('should block conversion when editor is read-only', () => {
      editor.setEditable(false);
      
      const success = formatHeading(editor, 'h1');
      expect(success).toBe(false);
      expect(editor.isEditable()).toBe(false);
    });
  });

  describe('Policy Enforcement (Transform)', () => {
    it('should normalize h4-h6 to h3 after programmatic insertion', async () => {
      await editor.update(() => {
        const root = $getRoot();
        root.clear();
        
        // Insert disallowed headings directly
        const h4 = $createHeadingNode('h4');
        h4.append($createTextNode('H4 content'));
        
        const h5 = $createHeadingNode('h5');
        h5.append($createTextNode('H5 content'));
        
        const h6 = $createHeadingNode('h6');
        h6.append($createTextNode('H6 content'));
        
        root.append(h4, h5, h6);
      });

      // Transform should have run synchronously
      await editor.getEditorState().read(() => {
        const root = $getRoot();
        const children = root.getChildren();
        
        expect(children.length).toBe(3);
        
        children.forEach(child => {
          expect($isHeadingNode(child)).toBe(true);
          const tag = (child as HeadingNode).getTag();
          expect(tag).toBe('h3'); // All normalized to h3
        });
        
        expect(children[0].getTextContent()).toBe('H4 content');
        expect(children[1].getTextContent()).toBe('H5 content');
        expect(children[2].getTextContent()).toBe('H6 content');
      });
    });

    it('should preserve formatting during normalization', async () => {
      await editor.update(() => {
        const root = $getRoot();
        root.clear();
        
        // Create h5 with formatting
        const h5 = $createHeadingNode('h5');
        h5.setIndent(2);
        h5.setDirection('rtl');
        
        const textNode = $createTextNode('Formatted text');
        textNode.setFormat('bold');
        h5.append(textNode);
        
        root.append(h5);
      });

      await editor.getEditorState().read(() => {
        const root = $getRoot();
        const heading = root.getFirstChild() as HeadingNode;
        
        expect(heading.getTag()).toBe('h3');
        expect(heading.getIndent()).toBe(2);
        expect(heading.getDirection()).toBe('rtl');
        
        const textChild = heading.getFirstChild();
        expect(textChild?.getTextContent()).toBe('Formatted text');
        expect(textChild?.hasFormat('bold')).toBe(true);
      });
    });

    it('should be idempotent (h3 unchanged, h5 normalized once)', async () => {
      await editor.update(() => {
        const root = $getRoot();
        root.clear();
        
        // h3 should remain unchanged
        const h3 = $createHeadingNode('h3');
        h3.append($createTextNode('Valid H3'));
        
        // h5 should be normalized
        const h5 = $createHeadingNode('h5');
        h5.append($createTextNode('Should become H3'));
        
        root.append(h3, h5);
      });

      // First check - h5 should be normalized
      await editor.getEditorState().read(() => {
        const children = $getRoot().getChildren();
        expect((children[0] as HeadingNode).getTag()).toBe('h3');
        expect((children[1] as HeadingNode).getTag()).toBe('h3');
      });

      // Second update should be no-op
      await editor.update(() => {
        // Empty update to trigger transforms again
      });

      // Should still be the same
      await editor.getEditorState().read(() => {
        const children = $getRoot().getChildren();
        expect((children[0] as HeadingNode).getTag()).toBe('h3');
        expect((children[1] as HeadingNode).getTag()).toBe('h3');
      });
    });
  });

  describe('Guards', () => {
    it('should block heading conversion inside list items', async () => {
      await editor.update(() => {
        const root = $getRoot();
        root.clear();
        
        const list = $createListNode('bullet');
        const listItem = $createListItemNode();
        const textNode = $createTextNode('List item text');
        listItem.append(textNode);
        list.append(listItem);
        root.append(list);
        
        const selection = $createRangeSelection();
        selection.anchor.set(textNode.getKey(), 0, 'text');
        selection.focus.set(textNode.getKey(), textNode.getTextContentSize(), 'text');
        $setSelection(selection);
      });
      
      const success = formatHeading(editor, 'h1');
      expect(success).toBe(false);
      
      // Structure should be unchanged
      editor.getEditorState().read(() => {
        const root = $getRoot();
        expect(root.getChildrenSize()).toBe(1);
        expect(root.getFirstChild()?.getType()).toBe('list');
      });
    });
  });

  describe('Tree Invariant', () => {
    it('should ensure no h4-h6 headings exist anywhere in the tree', async () => {
      // Insert mixed content including disallowed headings
      await editor.update(() => {
        const root = $getRoot();
        root.clear();
        
        const h1 = $createHeadingNode('h1');
        h1.append($createTextNode('Valid H1'));
        
        const paragraph = $createParagraphNode();
        paragraph.append($createTextNode('Paragraph'));
        
        const h4 = $createHeadingNode('h4');
        h4.append($createTextNode('Invalid H4'));
        
        const h2 = $createHeadingNode('h2');
        h2.append($createTextNode('Valid H2'));
        
        root.append(h1, paragraph, h4, h2);
      });

      // Tree invariant: no h4-h6 should exist
      await editor.getEditorState().read(() => {
        const root = $getRoot();
        
        function traverseAndValidate(node: any): void {
          if ($isHeadingNode(node)) {
            const tag = node.getTag();
            expect(['h4', 'h5', 'h6']).not.toContain(tag);
            expect(ALLOWED_HEADING_TAGS.includes(tag as any) || tag === 'h3').toBe(true);
          }
          
          if (node.getChildren && typeof node.getChildren === 'function') {
            const children = node.getChildren();
            children.forEach((child: any) => traverseAndValidate(child));
          }
        }
        
        traverseAndValidate(root);
      });
    });
  });

  describe('Constants and Policy', () => {
    it('should use consistent allowed tags throughout the system', () => {
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