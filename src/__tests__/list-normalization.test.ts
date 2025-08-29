import { describe, it, expect, beforeEach } from 'vitest';
import { createEditor, $getRoot, LexicalEditor, $createTextNode, ParagraphNode, TextNode } from 'lexical';
import { ListNode, ListItemNode, $createListNode, $createListItemNode } from '@lexical/list';
import { HeadingNode } from '@lexical/rich-text';
import { CodeNode, $createCodeNode } from '@lexical/code';
import { stripListPrefix, normalizeNBSP, hasListPrefix, isLikelyListItem } from '../utils/list-normalization';

describe('List Item Normalization', () => {
  let editor: LexicalEditor;

  beforeEach(() => {
    editor = createEditor({
      namespace: 'list-normalization-test',
      nodes: [HeadingNode, ParagraphNode, TextNode, ListNode, ListItemNode, CodeNode],
      onError: console.error
    });

    // Register the list normalization transform using shared utility
    editor.registerNodeTransform(ListItemNode, (node: ListItemNode) => {
      const firstChild = node.getFirstChild();
      
      if (firstChild && firstChild.getType() === 'text') {
        // Skip code nodes and code-formatted text
        const parent = firstChild.getParent();
        if (parent && parent.getType() === 'code') {
          return;
        }
        
        const text = firstChild.getTextContent();
        const cleanedText = stripListPrefix(text);
        
        if (text !== cleanedText) {
          firstChild.setTextContent(cleanedText);
        }
      }
    });
  });

  describe('Double Bullet Prevention', () => {
    it('should strip leading dash bullets from list items', async () => {
      await editor.update(() => {
        const root = $getRoot();
        root.clear();
        
        const list = $createListNode('bullet');
        const item1 = $createListItemNode();
        item1.append($createTextNode('- This had a dash prefix'));
        
        const item2 = $createListItemNode();
        item2.append($createTextNode('– This had an en-dash prefix'));
        
        const item3 = $createListItemNode();
        item3.append($createTextNode('— This had an em-dash prefix'));
        
        list.append(item1, item2, item3);
        root.append(list);
      });

      // Transform should run synchronously
      await editor.getEditorState().read(() => {
        const root = $getRoot();
        const list = root.getFirstChild() as ListNode;
        const items = list.getChildren() as ListItemNode[];
        
        expect(items[0].getTextContent()).toBe('This had a dash prefix');
        expect(items[1].getTextContent()).toBe('This had an en-dash prefix');
        expect(items[2].getTextContent()).toBe('This had an em-dash prefix');
      });
    });

    it('should strip asterisk and bullet symbols', async () => {
      await editor.update(() => {
        const root = $getRoot();
        root.clear();
        
        const list = $createListNode('bullet');
        
        const item1 = $createListItemNode();
        item1.append($createTextNode('* Asterisk prefix'));
        
        const item2 = $createListItemNode();
        item2.append($createTextNode('• Bullet symbol prefix'));
        
        const item3 = $createListItemNode();
        item3.append($createTextNode('◦ Circle prefix'));
        
        const item4 = $createListItemNode();
        item4.append($createTextNode('▪ Square prefix'));
        
        list.append(item1, item2, item3, item4);
        root.append(list);
      });

      await editor.getEditorState().read(() => {
        const root = $getRoot();
        const list = root.getFirstChild() as ListNode;
        const items = list.getChildren() as ListItemNode[];
        
        expect(items[0].getTextContent()).toBe('Asterisk prefix');
        expect(items[1].getTextContent()).toBe('Bullet symbol prefix');
        expect(items[2].getTextContent()).toBe('Circle prefix');
        expect(items[3].getTextContent()).toBe('Square prefix');
      });
    });

    it('should strip numbered list prefixes', async () => {
      await editor.update(() => {
        const root = $getRoot();
        root.clear();
        
        const list = $createListNode('number');
        
        const item1 = $createListItemNode();
        item1.append($createTextNode('1. First item'));
        
        const item2 = $createListItemNode();
        item2.append($createTextNode('2) Second item'));
        
        const item3 = $createListItemNode();
        item3.append($createTextNode('a. Letter item'));
        
        const item4 = $createListItemNode();
        item4.append($createTextNode('A) Capital letter'));
        
        list.append(item1, item2, item3, item4);
        root.append(list);
      });

      await editor.getEditorState().read(() => {
        const root = $getRoot();
        const list = root.getFirstChild() as ListNode;
        const items = list.getChildren() as ListItemNode[];
        
        expect(items[0].getTextContent()).toBe('First item');
        expect(items[1].getTextContent()).toBe('Second item');
        expect(items[2].getTextContent()).toBe('Letter item');
        expect(items[3].getTextContent()).toBe('Capital letter');
      });
    });

    it('should not strip content that looks like a prefix but isnt at the start', async () => {
      await editor.update(() => {
        const root = $getRoot();
        root.clear();
        
        const list = $createListNode('bullet');
        
        const item1 = $createListItemNode();
        item1.append($createTextNode('No prefix - dash in middle'));
        
        const item2 = $createListItemNode();
        item2.append($createTextNode('Price: $10 * quantity'));
        
        const item3 = $createListItemNode();
        item3.append($createTextNode('Email: user@example.com'));
        
        list.append(item1, item2, item3);
        root.append(list);
      });

      await editor.getEditorState().read(() => {
        const root = $getRoot();
        const list = root.getFirstChild() as ListNode;
        const items = list.getChildren() as ListItemNode[];
        
        // Content should remain unchanged
        expect(items[0].getTextContent()).toBe('No prefix - dash in middle');
        expect(items[1].getTextContent()).toBe('Price: $10 * quantity');
        expect(items[2].getTextContent()).toBe('Email: user@example.com');
      });
    });

    it('should handle empty and whitespace-only items gracefully', async () => {
      await editor.update(() => {
        const root = $getRoot();
        root.clear();
        
        const list = $createListNode('bullet');
        
        const item1 = $createListItemNode();
        item1.append($createTextNode(''));
        
        const item2 = $createListItemNode();
        item2.append($createTextNode('   '));
        
        const item3 = $createListItemNode();
        item3.append($createTextNode('-   ')); // Just prefix and spaces
        
        list.append(item1, item2, item3);
        root.append(list);
      });

      await editor.getEditorState().read(() => {
        const root = $getRoot();
        const list = root.getFirstChild() as ListNode;
        const items = list.getChildren() as ListItemNode[];
        
        expect(items[0].getTextContent()).toBe('');
        expect(items[1].getTextContent()).toBe('   ');
        expect(items[2].getTextContent()).toBe(''); // Stripped to empty
      });
    });

    it('should be idempotent (multiple runs produce same result)', async () => {
      await editor.update(() => {
        const root = $getRoot();
        root.clear();
        
        const list = $createListNode('bullet');
        const item = $createListItemNode();
        item.append($createTextNode('- Test item'));
        list.append(item);
        root.append(list);
      });

      // First check - should be cleaned
      let firstResult: string;
      await editor.getEditorState().read(() => {
        const root = $getRoot();
        const list = root.getFirstChild() as ListNode;
        const item = list.getFirstChild() as ListItemNode;
        firstResult = item.getTextContent();
      });

      // Trigger another update to ensure transform doesn't run again
      await editor.update(() => {
        // Empty update
      });

      // Second check - should be the same
      await editor.getEditorState().read(() => {
        const root = $getRoot();
        const list = root.getFirstChild() as ListNode;
        const item = list.getFirstChild() as ListItemNode;
        expect(item.getTextContent()).toBe(firstResult!);
        expect(item.getTextContent()).toBe('Test item');
      });
    });

    it('should handle NBSP (U+00A0) in prefixes', async () => {
      await editor.update(() => {
        const root = $getRoot();
        root.clear();
        
        const list = $createListNode('bullet');
        
        // Create text with NBSP character (U+00A0) after bullet
        const item1 = $createListItemNode();
        item1.append($createTextNode('•\u00a0NBSP after bullet'));
        
        const item2 = $createListItemNode();
        item2.append($createTextNode('-\u00a0NBSP after dash'));
        
        list.append(item1, item2);
        root.append(list);
      });

      await editor.getEditorState().read(() => {
        const root = $getRoot();
        const list = root.getFirstChild() as ListNode;
        const items = list.getChildren() as ListItemNode[];
        
        expect(items[0].getTextContent()).toBe('NBSP after bullet');
        expect(items[1].getTextContent()).toBe('NBSP after dash');
      });
    });

    it('should not strip prefixes from code-formatted text', async () => {
      await editor.update(() => {
        const root = $getRoot();
        root.clear();
        
        const list = $createListNode('bullet');
        
        const item1 = $createListItemNode();
        const codeText = $createTextNode('git add -A');
        // Simulate code formatting (format bit)
        (codeText as any).setFormat?.(16); // FORMAT_CODE = 16
        item1.append(codeText);
        
        list.append(item1);
        root.append(list);
      });

      await editor.getEditorState().read(() => {
        const root = $getRoot();
        const list = root.getFirstChild() as ListNode;
        const item = list.getFirstChild() as ListItemNode;
        
        // Code should remain unchanged
        expect(item.getTextContent()).toBe('git add -A');
      });
    });

    it('should not strip prefixes when parent is a code node', async () => {
      await editor.update(() => {
        const root = $getRoot();
        root.clear();
        
        const codeBlock = $createCodeNode();
        codeBlock.append($createTextNode('- This is code with a dash\n* Not a list item'));
        
        root.append(codeBlock);
      });

      await editor.getEditorState().read(() => {
        const root = $getRoot();
        const codeBlock = root.getFirstChild() as CodeNode;
        
        // Code content should remain unchanged
        expect(codeBlock.getTextContent()).toBe('- This is code with a dash\n* Not a list item');
      });
    });
  });

  describe('Utility Functions', () => {
    it('should normalize NBSP to regular spaces', () => {
      expect(normalizeNBSP('text\u00a0with\u00a0nbsp')).toBe('text with nbsp');
      expect(normalizeNBSP('•\u00a0Item')).toBe('• Item');
      expect(normalizeNBSP('normal text')).toBe('normal text');
    });

    it('should detect list prefixes correctly', () => {
      expect(hasListPrefix('• Item')).toBe(true);
      expect(hasListPrefix('- Item')).toBe(true);
      expect(hasListPrefix('1. Item')).toBe(true);
      expect(hasListPrefix('a) Item')).toBe(true);
      expect(hasListPrefix('•\u00a0Item')).toBe(true); // With NBSP
      expect(hasListPrefix('No prefix')).toBe(false);
      expect(hasListPrefix('-but no space')).toBe(false);
    });

    it('should identify likely list items conservatively', () => {
      // Valid list items
      expect(isLikelyListItem('• Item text')).toBe(true);
      expect(isLikelyListItem('- Item text')).toBe(true);
      expect(isLikelyListItem('1. Item text')).toBe(true);
      
      // False positives to avoid
      expect(isLikelyListItem('- ')).toBe(false); // No content after
      expect(isLikelyListItem('- —this—')).toBe(false); // Dash in content, not word boundary
      expect(isLikelyListItem('- ```code')).toBe(false); // Markdown fence
      expect(isLikelyListItem('- # Header')).toBe(false); // Markdown header
      expect(isLikelyListItem('- > Quote')).toBe(false); // Markdown blockquote
      
      // Edge cases
      expect(isLikelyListItem('- item')).toBe(true); // Valid with word
      expect(isLikelyListItem('-item')).toBe(false); // No space after prefix
    });

    it('should strip prefixes from mixed content', () => {
      expect(stripListPrefix('• Item text')).toBe('Item text');
      expect(stripListPrefix('- Another item')).toBe('Another item');
      expect(stripListPrefix('1. Numbered item')).toBe('Numbered item');
      expect(stripListPrefix('a) Letter item')).toBe('Letter item');
      expect(stripListPrefix('•\u00a0NBSP item')).toBe('NBSP item');
      expect(stripListPrefix('No prefix here')).toBe('No prefix here');
    });
  });
});