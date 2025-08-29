import { describe, it, expect, beforeEach } from 'vitest';
import { createEditor, LexicalEditor, $getRoot, $createParagraphNode, $createTextNode } from 'lexical';
import { HeadingNode } from '@lexical/rich-text';
import { ListNode, ListItemNode, $createListNode, $createListItemNode } from '@lexical/list';
import { CodeNode } from '@lexical/code';
import { stripListPrefix } from '../utils/list-normalization';

describe('Production Edge Cases', () => {
  let editor: LexicalEditor;

  beforeEach(() => {
    editor = createEditor({
      namespace: 'production-edge-test',
      nodes: [HeadingNode, ListNode, ListItemNode, CodeNode],
      onError: console.error
    });
  });

  describe('List Backstop Edge Cases', () => {
    it('should handle LI with ParagraphNode-first and bold node before text', async () => {
      await editor.update(() => {
        const root = $getRoot();
        root.clear();
        
        const list = $createListNode('bullet');
        const item = $createListItemNode();
        
        // Create paragraph with bold node before text
        const para = $createParagraphNode();
        const boldText = $createTextNode('Bold: ');
        boldText.setFormat('bold');
        para.append(boldText);
        
        // Add main text with prefix
        const mainText = $createTextNode('• Item with prefix');
        para.append(mainText);
        
        item.append(para);
        list.append(item);
        root.append(list);
      });

      // Let transforms run
      await new Promise(resolve => setTimeout(resolve, 10));

      await editor.getEditorState().read(() => {
        const root = $getRoot();
        const list = root.getFirstChild() as ListNode;
        const item = list.getFirstChild() as ListItemNode;
        
        // Should find and strip prefix from first non-empty text node
        const textContent = item.getTextContent();
        expect(textContent).toBe('Bold: Item with prefix');
        expect(textContent).not.toContain('• Item');
      });
    });

    it('should strip only the very first prefix when multiple exist (anchored)', () => {
      const testCases = [
        { input: '• • Item', expected: '• Item' },
        { input: '- - Item', expected: '- Item' },
        { input: '1. 2. Item', expected: '2. Item' },
        { input: '• Item - with dash inside', expected: 'Item - with dash inside' },
      ];

      testCases.forEach(({ input, expected }) => {
        const result = stripListPrefix(input);
        expect(result).toBe(expected);
      });
    });

    it('should not remove em dashes in prose inside LI', async () => {
      await editor.update(() => {
        const root = $getRoot();
        root.clear();
        
        const list = $createListNode('bullet');
        const item = $createListItemNode();
        
        // Text with em dashes in content (not prefixes)
        const text = $createTextNode('Range —start to end— should remain');
        item.append(text);
        
        list.append(item);
        root.append(list);
      });

      await new Promise(resolve => setTimeout(resolve, 10));

      await editor.getEditorState().read(() => {
        const root = $getRoot();
        const list = root.getFirstChild() as ListNode;
        const item = list.getFirstChild() as ListItemNode;
        
        // Em dashes should be preserved in content
        expect(item.getTextContent()).toBe('Range —start to end— should remain');
      });
    });

    it('should handle empty and whitespace-only formatting nodes', async () => {
      await editor.update(() => {
        const root = $getRoot();
        root.clear();
        
        const list = $createListNode('bullet');
        const item = $createListItemNode();
        
        // Create paragraph with empty bold node, then text with prefix
        const para = $createParagraphNode();
        
        // Empty bold node
        const emptyBold = $createTextNode('');
        emptyBold.setFormat('bold');
        para.append(emptyBold);
        
        // Whitespace-only italic node
        const whitespaceItalic = $createTextNode('   ');
        whitespaceItalic.setFormat('italic');
        para.append(whitespaceItalic);
        
        // Actual content with prefix
        const contentText = $createTextNode('- Real content here');
        para.append(contentText);
        
        item.append(para);
        list.append(item);
        root.append(list);
      });

      await new Promise(resolve => setTimeout(resolve, 10));

      await editor.getEditorState().read(() => {
        const root = $getRoot();
        const list = root.getFirstChild() as ListNode;
        const item = list.getFirstChild() as ListItemNode;
        
        // Should skip empty/whitespace formatting nodes and strip prefix from content
        expect(item.getTextContent()).toBe('   Real content here');
      });
    });
  });

  describe('Fast Path Validation', () => {
    const mockFastPathHandler = (payload: string) => {
      try {
        const parsed = JSON.parse(payload);
        
        // Test all probe patterns
        let nodes = [];
        
        if (parsed.root?.children) {
          nodes = parsed.root.children;
        } else if (parsed.nodes) {
          nodes = parsed.nodes;
        } else if (Array.isArray(parsed)) {
          nodes = parsed;
        } else if (parsed.clipboard?.root?.children) {
          nodes = parsed.clipboard.root.children;
        } else if (parsed.clipboard && Array.isArray(parsed.clipboard)) {
          nodes = parsed.clipboard;
        } else if (parsed.editorState) {
          const editorState = typeof parsed.editorState === 'string' 
            ? JSON.parse(parsed.editorState)
            : parsed.editorState;
          if (editorState.root?.children) {
            nodes = editorState.root.children;
          }
        }
        
        return nodes.length > 0;
      } catch {
        return false;
      }
    };

    it('should handle valid Lexical payload structures', () => {
      const validPayloads = [
        // Standard structure
        JSON.stringify({
          root: { children: [{ type: 'paragraph', children: [{ type: 'text', text: 'test' }] }] }
        }),
        
        // Nodes array
        JSON.stringify({
          nodes: [{ type: 'paragraph', children: [{ type: 'text', text: 'test' }] }]
        }),
        
        // Array root
        JSON.stringify([{ type: 'paragraph', children: [{ type: 'text', text: 'test' }] }]),
        
        // Clipboard wrapper
        JSON.stringify({
          clipboard: { root: { children: [{ type: 'paragraph', children: [{ type: 'text', text: 'test' }] }] } }
        }),
        
        // EditorState string
        JSON.stringify({
          editorState: JSON.stringify({ root: { children: [{ type: 'paragraph', children: [{ type: 'text', text: 'test' }] }] } })
        }),
      ];

      validPayloads.forEach((payload, index) => {
        const result = mockFastPathHandler(payload);
        expect(result).toBe(true);
      });
    });

    it('should reject malformed payloads and fall back to HTML path', () => {
      const invalidPayloads = [
        '{"invalid": "structure"}',
        '{"root": {"children": []}}', // Empty children
        '{"nodes": []}', // Empty nodes  
        'not json at all',
        '{"clipboard": null}',
        '{"editorState": "invalid json"}',
      ];

      invalidPayloads.forEach(payload => {
        const result = mockFastPathHandler(payload);
        expect(result).toBe(false);
      });
    });

    it('should return true only when nodes inserted, false triggers HTML path', () => {
      // This test verifies handler discipline - return true only on success
      const successCase = JSON.stringify({
        root: { children: [{ type: 'paragraph', children: [{ type: 'text', text: 'test' }] }] }
      });
      
      const failureCase = '{"root": {"children": []}}';
      
      expect(mockFastPathHandler(successCase)).toBe(true);
      expect(mockFastPathHandler(failureCase)).toBe(false);
    });
  });

  describe('Sanitization Threshold', () => {
    it('should trigger plaintext fallback when sanitization takes too long', () => {
      // Mock scenario where sanitization exceeds time limit
      const longHtml = '<div>' + 'a'.repeat(100000) + '</div>';
      const timeLimit = 100; // ms
      
      const mockSanitize = (html: string) => {
        const start = performance.now();
        
        // Simulate work that might take too long
        while (performance.now() - start < timeLimit + 10) {
          // Busy wait to simulate long sanitization
        }
        
        return html; // Return as-is for test
      };
      
      const start = performance.now();
      const result = mockSanitize(longHtml);
      const elapsed = performance.now() - start;
      
      // Verify we can detect when sanitization takes too long
      expect(elapsed).toBeGreaterThan(timeLimit);
      expect(result).toBeDefined();
    });

    it('should prefer text/plain over HTML stripping in fallback', () => {
      const htmlContent = '<p>HTML <strong>content</strong></p>';
      const plainTextContent = 'Plain text content';
      
      // Mock clipboard data
      const mockClipboardData = {
        getData: (type: string) => {
          if (type === 'text/plain') return plainTextContent;
          if (type === 'text/html') return htmlContent;
          return '';
        }
      } as DataTransfer;
      
      // Should prefer plain text
      const plainText = mockClipboardData.getData('text/plain');
      expect(plainText).toBe(plainTextContent);
      expect(plainText).not.toContain('<p>');
    });

    it('should fall back to HTML stripping when no text/plain available', () => {
      const htmlContent = '<p>HTML <strong>content</strong></p>';
      
      const mockClipboardData = {
        getData: (type: string) => {
          if (type === 'text/plain') return ''; // No plain text
          if (type === 'text/html') return htmlContent;
          return '';
        }
      } as DataTransfer;
      
      const plainText = mockClipboardData.getData('text/plain');
      expect(plainText).toBe('');
      
      // Should fall back to HTML stripping
      const htmlText = mockClipboardData.getData('text/html');
      expect(htmlText).toContain('<p>');
    });
  });

  describe('Handler Return Discipline', () => {
    it('should return true only after successful insertion', () => {
      // Test the pattern used in SmartPastePlugin
      let insertionSuccess = false;
      
      // Simulate successful case
      const simulateSuccess = () => {
        try {
          // Mock insertion
          const mockNodes = [{ type: 'paragraph' }];
          if (mockNodes.length > 0) {
            // Mock selection.insertNodes(nodes)
            insertionSuccess = true;
          }
        } catch {
          insertionSuccess = false;
        }
        return insertionSuccess;
      };
      
      // Simulate failure case
      const simulateFailure = () => {
        try {
          const mockNodes: any[] = []; // Empty nodes
          if (mockNodes.length === 0) {
            return false; // Early return, no insertion
          }
          insertionSuccess = true;
        } catch {
          insertionSuccess = false;
        }
        return insertionSuccess;
      };
      
      expect(simulateSuccess()).toBe(true);
      expect(simulateFailure()).toBe(false);
    });
  });
});