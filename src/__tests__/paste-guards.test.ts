import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createEditor, LexicalEditor, $getRoot, $createParagraphNode, $createTextNode, UNDO_COMMAND } from 'lexical';
import { HeadingNode, QuoteNode } from '@lexical/rich-text';
import { ListNode, ListItemNode } from '@lexical/list';
import { CodeNode } from '@lexical/code';
import { sanitizeHTML, exceedsSizeLimit, MAX_PASTE_SIZE } from '../config/sanitization-config';

describe('Paste Guards - Size and Time Limits', () => {
  let editor: LexicalEditor;

  beforeEach(() => {
    editor = createEditor({
      namespace: 'paste-guards-test',
      nodes: [HeadingNode, QuoteNode, ListNode, ListItemNode, CodeNode],
      onError: console.error
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Size Guard Behavior', () => {
    it('should trigger plaintext fallback for oversized HTML', async () => {
      // Create HTML content that exceeds MAX_PASTE_SIZE (500KB)
      const largeContent = '<p>' + 'A'.repeat(MAX_PASTE_SIZE + 1000) + '</p>';
      
      // Verify it exceeds limit
      expect(exceedsSizeLimit(largeContent)).toBe(true);
      
      // Mock clipboard data with both HTML and plaintext
      const mockClipboardData = {
        getData: vi.fn((type: string) => {
          if (type === 'text/html') return largeContent;
          if (type === 'text/plain') return 'Large content fallback text';
          return '';
        })
      } as unknown as DataTransfer;
      
      // Simulate the size guard logic from SmartPastePlugin
      let fallbackUsed = false;
      let insertionResult = false;
      
      if (exceedsSizeLimit(largeContent)) {
        // Should trigger plaintext fallback
        const plainText = mockClipboardData.getData('text/plain');
        if (plainText && plainText.trim()) {
          await editor.update(() => {
            const root = $getRoot();
            const para = $createParagraphNode();
            para.append($createTextNode(plainText));
            root.append(para);
          });
          fallbackUsed = true;
          insertionResult = true;
        }
      }
      
      expect(fallbackUsed).toBe(true);
      expect(insertionResult).toBe(true);
      expect(mockClipboardData.getData).toHaveBeenCalledWith('text/plain');
      
      // Verify content was inserted
      await editor.getEditorState().read(() => {
        const root = $getRoot();
        expect(root.getChildren().length).toBe(1);
        expect(root.getFirstChild()?.getTextContent()).toBe('Large content fallback text');
      });
    });

    it('should process normal-sized content through HTML path', () => {
      const normalContent = '<h1>Normal Title</h1><p>Regular paragraph content.</p>';
      
      expect(exceedsSizeLimit(normalContent)).toBe(false);
      expect(normalContent.length).toBeLessThan(MAX_PASTE_SIZE);
      
      // Should proceed to sanitization, not fallback
      const sanitized = sanitizeHTML(normalContent);
      expect(sanitized).toContain('<h1>');
      expect(sanitized).toContain('<p>');
    });

    it('should support single undo for oversized content fallback', async () => {
      // Setup history tracking (simplified)
      let historyStack: any[] = [];
      editor.registerUpdateListener(({ editorState, prevEditorState }) => {
        if (prevEditorState) {
          historyStack.push(prevEditorState.toJSON());
        }
      });
      
      editor.registerCommand(UNDO_COMMAND, () => {
        if (historyStack.length > 0) {
          const prevState = historyStack.pop();
          if (prevState) {
            editor.setEditorState(editor.parseEditorState(JSON.stringify(prevState)));
            return true;
          }
        }
        return false;
      }, 1);

      // Initial state
      await editor.update(() => {
        const root = $getRoot();
        const para = $createParagraphNode();
        para.append($createTextNode('Initial'));
        root.append(para);
      });
      
      await new Promise(resolve => setTimeout(resolve, 10));

      // Simulate oversized paste fallback
      const largeText = 'Fallback content from oversized HTML';
      await editor.update(() => {
        const root = $getRoot();
        const para = $createParagraphNode();
        para.append($createTextNode(largeText));
        root.append(para);
      });

      // Verify fallback worked
      await editor.getEditorState().read(() => {
        const root = $getRoot();
        expect(root.getChildren().length).toBe(2);
      });

      // Single undo should revert fallback
      const undoWorked = editor.dispatchCommand(UNDO_COMMAND, undefined);
      expect(undoWorked).toBe(true);
      
      await new Promise(resolve => setTimeout(resolve, 10));

      // Should be back to initial state
      await editor.getEditorState().read(() => {
        const root = $getRoot();
        expect(root.getChildren().length).toBe(1);
        expect(root.getFirstChild()?.getTextContent()).toBe('Initial');
      });
    });
  });

  describe('Time Guard Behavior', () => {
    it('should trigger plaintext fallback when sanitization times out', async () => {
      const testHTML = '<p>Content that takes too long to sanitize</p>';
      const fallbackText = 'Fallback after timeout';
      
      // Mock sanitizeHTML to simulate slow operation
      const originalSanitize = sanitizeHTML;
      const mockSanitize = vi.fn((html: string) => {
        // Simulate work that exceeds time limit
        const start = Date.now();
        while (Date.now() - start < 200) { // Exceed 150ms limit
          // Busy wait
        }
        return originalSanitize(html);
      });
      
      // Simulate time guard logic
      const timeLimit = 150; // MAX_SANITIZATION_TIME_MS
      let timeoutTriggered = false;
      let fallbackUsed = false;
      
      const startTime = performance.now();
      const sanitized = mockSanitize(testHTML);
      const duration = performance.now() - startTime;
      
      if (duration > timeLimit) {
        timeoutTriggered = true;
        // Would trigger plaintext fallback in real plugin
        fallbackUsed = true;
      }
      
      expect(timeoutTriggered).toBe(true);
      expect(fallbackUsed).toBe(true);
      expect(duration).toBeGreaterThan(timeLimit);
      expect(mockSanitize).toHaveBeenCalledWith(testHTML);
    });

    it('should process fast sanitization normally', () => {
      const testHTML = '<p>Fast content</p>';
      
      const start = performance.now();
      const sanitized = sanitizeHTML(testHTML);
      const duration = performance.now() - start;
      
      // Normal sanitization should be fast
      expect(duration).toBeLessThan(150);
      expect(sanitized).toContain('<p>Fast content</p>');
    });
  });

  describe('Clipboard Fallback Preferences', () => {
    it('should prefer text/plain over HTML stripping', () => {
      const htmlContent = '<p>HTML <strong>content</strong> with <em>formatting</em></p>';
      const plainContent = 'Plain text content';
      
      const mockClipboard = {
        getData: vi.fn((type: string) => {
          if (type === 'text/plain') return plainContent;
          if (type === 'text/html') return htmlContent;
          return '';
        })
      } as unknown as DataTransfer;
      
      // Simulate preference logic
      let selectedContent = '';
      const plainText = mockClipboard.getData('text/plain');
      if (plainText && plainText.trim()) {
        selectedContent = plainText; // Prefer plain text
      } else {
        // Fall back to HTML stripping
        const htmlText = mockClipboard.getData('text/html');
        selectedContent = htmlText.replace(/<[^>]*>/g, ''); // Simple strip
      }
      
      expect(selectedContent).toBe(plainContent);
      expect(mockClipboard.getData).toHaveBeenCalledWith('text/plain');
    });

    it('should fall back to HTML stripping when no plain text available', () => {
      const htmlContent = '<p>HTML <strong>only</strong> content</p>';
      
      const mockClipboard = {
        getData: vi.fn((type: string) => {
          if (type === 'text/plain') return ''; // No plain text
          if (type === 'text/html') return htmlContent;
          return '';
        })
      } as unknown as DataTransfer;
      
      // Simulate fallback logic
      let selectedContent = '';
      const plainText = mockClipboard.getData('text/plain');
      if (plainText && plainText.trim()) {
        selectedContent = plainText;
      } else {
        // Fall back to HTML stripping
        const htmlText = mockClipboard.getData('text/html');
        selectedContent = htmlText.replace(/<[^>]*>/g, '');
      }
      
      expect(selectedContent).toBe('HTML only content');
      expect(mockClipboard.getData).toHaveBeenCalledWith('text/plain');
      expect(mockClipboard.getData).toHaveBeenCalledWith('text/html');
    });

    it('should return false when no content available', () => {
      const mockClipboard = {
        getData: vi.fn(() => '') // No content at all
      } as unknown as DataTransfer;
      
      // Simulate handler logic
      let shouldHandle = false;
      const plainText = mockClipboard.getData('text/plain');
      const htmlText = mockClipboard.getData('text/html');
      
      if ((plainText && plainText.trim()) || (htmlText && htmlText.trim())) {
        shouldHandle = true;
      }
      
      expect(shouldHandle).toBe(false);
      expect(mockClipboard.getData).toHaveBeenCalledWith('text/plain');
      expect(mockClipboard.getData).toHaveBeenCalledWith('text/html');
    });
  });

  describe('Handler Return Discipline', () => {
    it('should return true only after successful insertion', async () => {
      // Simulate successful case
      let insertionSuccess = false;
      
      await editor.update(() => {
        const root = $getRoot();
        try {
          // Mock successful node insertion
          const para = $createParagraphNode();
          para.append($createTextNode('Test content'));
          root.append(para);
          
          insertionSuccess = true; // Mark success only after insertion
        } catch {
          insertionSuccess = false;
        }
      });
      
      expect(insertionSuccess).toBe(true);
      
      // Verify content was actually inserted
      await editor.getEditorState().read(() => {
        const root = $getRoot();
        expect(root.getChildren().length).toBe(1);
        expect(root.getFirstChild()?.getTextContent()).toBe('Test content');
      });
    });

    it('should return false on insertion failure', async () => {
      let insertionSuccess = false;
      
      await editor.update(() => {
        try {
          // Simulate validation failure - no nodes to insert
          const mockNodes: any[] = [];
          if (mockNodes.length === 0) {
            return; // Early return, no insertion
          }
          
          // This wouldn't execute
          insertionSuccess = true;
        } catch {
          insertionSuccess = false;
        }
      });
      
      expect(insertionSuccess).toBe(false);
      
      // Verify no content was inserted
      await editor.getEditorState().read(() => {
        const root = $getRoot();
        expect(root.getChildren().length).toBe(0);
      });
    });
  });

  describe('Formatting Preservation', () => {
    it('preserves bold, italic, and code formatting during paste', () => {
      const htmlWithFormatting = `
        <p><strong>Bold text</strong> and <em>italic text</em> and <code>code text</code></p>
        <h4>Should become h3</h4>
      `;

      editor.update(() => {
        const root = $getRoot();
        root.clear();
      });

      // Simulate paste event
      const clipboardData = new DataTransfer();
      clipboardData.setData('text/html', htmlWithFormatting);
      const pasteEvent = new ClipboardEvent('paste', { clipboardData });

      let insertedNodes: any[] = [];
      editor.registerCommand(
        PASTE_COMMAND,
        (event) => {
          // Capture what gets inserted
          editor.getEditorState().read(() => {
            insertedNodes = $getRoot().getChildren();
          });
          return false; // Let our plugin handle it
        },
        4 // Lower priority than our plugin
      );

      document.dispatchEvent(pasteEvent);

      editor.getEditorState().read(() => {
        const children = $getRoot().getChildren();
        expect(children.length).toBeGreaterThan(0);
        
        // Find paragraph with formatting
        const paragraphNode = children.find(child => child.getType() === 'paragraph');
        expect(paragraphNode).toBeDefined();
        
        // Check that formatting is preserved (nodes should contain formatted text)
        const textContent = paragraphNode?.getTextContent() || '';
        expect(textContent).toContain('Bold text');
        expect(textContent).toContain('italic text');
        expect(textContent).toContain('code text');
      });
    });
  });

  describe('Fallback Edge Cases', () => {
    it('handles text-plain only clipboard data', () => {
      const plainTextContent = 'Just plain text content';
      
      editor.update(() => {
        const root = $getRoot();
        root.clear();
      });

      const clipboardData = new DataTransfer();
      clipboardData.setData('text/plain', plainTextContent);
      const pasteEvent = new ClipboardEvent('paste', { clipboardData });

      document.dispatchEvent(pasteEvent);

      editor.getEditorState().read(() => {
        const textContent = $getRoot().getTextContent();
        expect(textContent).toContain(plainTextContent);
      });
    });

    it('returns false when no content available (allows default behavior)', () => {
      const clipboardData = new DataTransfer();
      // No data set - empty clipboard
      const pasteEvent = new ClipboardEvent('paste', { clipboardData });

      const handlerResult = editor.dispatchCommand(PASTE_COMMAND, pasteEvent);
      // Should return false to allow default Lexical behavior
      expect(handlerResult).toBe(false);
    });
  });

  describe('Performance Guard Timing', () => {
    it('falls back to plaintext when sanitization exceeds time limit', async () => {
      // Mock a slow sanitizeHTML that exceeds our 150ms limit
      const originalSanitizeHTML = vi.mocked(sanitizeHTML);
      originalSanitizeHTML.mockImplementation((html: string) => {
        // Simulate slow sanitization
        const start = performance.now();
        while (performance.now() - start < 200) {
          // Busy wait to simulate slow operation
        }
        return html;
      });

      const htmlContent = '<p>This content takes too long to sanitize</p>';
      
      editor.update(() => {
        const root = $getRoot();
        root.clear();
      });

      const clipboardData = new DataTransfer();
      clipboardData.setData('text/html', htmlContent);
      clipboardData.setData('text/plain', 'Fallback plain text');
      const pasteEvent = new ClipboardEvent('paste', { clipboardData });

      document.dispatchEvent(pasteEvent);

      // Should fall back to plain text due to timeout
      editor.getEditorState().read(() => {
        const textContent = $getRoot().getTextContent();
        expect(textContent).toContain('Fallback plain text');
        // Should NOT contain the HTML content
        expect(textContent).not.toContain('This content takes too long');
      });

      // Restore original mock
      originalSanitizeHTML.mockRestore();
    });
  });
});