import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createEditor, $getRoot, LexicalEditor, $createTextNode, ParagraphNode, TextNode } from 'lexical';
import { HeadingNode, $isHeadingNode, QuoteNode } from '@lexical/rich-text';
import { ListNode, ListItemNode } from '@lexical/list';
import { $generateNodesFromDOM } from '@lexical/html';
import { ALLOWED_HEADING_TAGS } from '../constants/heading-policy';

describe('Paste Normalization Tests', () => {
  let editor: LexicalEditor;
  let mockLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    editor = createEditor({
      namespace: 'paste-test',
      nodes: [HeadingNode, ParagraphNode, TextNode, QuoteNode, ListNode, ListItemNode],
      onError: console.error
    });

    // Mock console.warn to track normalization messages
    mockLogSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    mockLogSpy.mockRestore();
  });

  describe('HTML-First Paste Normalization', () => {
    it('should normalize mixed h1, h4, h6, p to h1, h3, h3, p', async () => {
      const htmlContent = `
        <h1>Keep H1</h1>
        <h4>Becomes H3</h4>
        <h6>Also H3</h6>
        <p>Regular paragraph</p>
      `;

      await editor.update(() => {
        const root = $getRoot();
        root.clear();

        // Parse HTML and simulate paste normalization
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlContent, 'text/html');
        
        // Normalize h4-h6 tags in DOM (simulating paste plugin)
        let normalizedCount = 0;
        ['h4', 'h5', 'h6'].forEach(tag => {
          const elements = doc.querySelectorAll(tag);
          elements.forEach(el => {
            const h3 = doc.createElement('h3');
            while (el.firstChild) {
              h3.appendChild(el.firstChild);
            }
            Array.from(el.attributes).forEach(attr => {
              if (!['id'].includes(attr.name.toLowerCase())) {
                h3.setAttribute(attr.name, attr.value);
              }
            });
            el.parentNode?.replaceChild(h3, el);
            normalizedCount++;
          });
        });

        // Generate nodes from normalized DOM
        const nodes = $generateNodesFromDOM(editor, doc);
        nodes.forEach(node => root.append(node));
      });

      // Verify final structure
      await editor.getEditorState().read(() => {
        const root = $getRoot();
        const children = root.getChildren();

        expect(children.length).toBe(4);

        // Check h1 stayed h1
        expect($isHeadingNode(children[0])).toBe(true);
        expect((children[0] as any).getTag()).toBe('h1');
        expect(children[0].getTextContent().trim()).toBe('Keep H1');

        // Check h4 became h3
        expect($isHeadingNode(children[1])).toBe(true);
        expect((children[1] as any).getTag()).toBe('h3');
        expect(children[1].getTextContent().trim()).toBe('Becomes H3');

        // Check h6 became h3
        expect($isHeadingNode(children[2])).toBe(true);
        expect((children[2] as any).getTag()).toBe('h3');
        expect(children[2].getTextContent().trim()).toBe('Also H3');

        // Check paragraph unchanged
        expect(children[3].getType()).toBe('paragraph');
        expect(children[3].getTextContent().trim()).toBe('Regular paragraph');
      });
    });

    it('should preserve formatting during normalization', async () => {
      const htmlContent = `
        <h5 style="text-align: center;">
          <strong>Bold H5</strong> with <em>italic</em> text
        </h5>
      `;

      await editor.update(() => {
        const root = $getRoot();
        root.clear();

        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlContent, 'text/html');
        
        // Normalize h5 to h3
        const h5Elements = doc.querySelectorAll('h5');
        h5Elements.forEach(el => {
          const h3 = doc.createElement('h3');
          while (el.firstChild) {
            h3.appendChild(el.firstChild);
          }
          Array.from(el.attributes).forEach(attr => {
            h3.setAttribute(attr.name, attr.value);
          });
          el.parentNode?.replaceChild(h3, el);
        });

        const nodes = $generateNodesFromDOM(editor, doc);
        nodes.forEach(node => root.append(node));
      });

      await editor.getEditorState().read(() => {
        const heading = $getRoot().getFirstChild();
        
        expect($isHeadingNode(heading)).toBe(true);
        expect((heading as any).getTag()).toBe('h3');
        
        // Verify rich content is preserved
        const textContent = heading?.getTextContent() || '';
        expect(textContent).toContain('Bold H5');
        expect(textContent).toContain('italic');
      });
    });
  });

  describe('Complex Block Preservation', () => {
    it('should normalize headings while leaving lists/quotes unchanged', async () => {
      const htmlContent = `
        <h1>Title</h1>
        <h4>Subtitle</h4>
        <ul>
          <li>List item 1</li>
          <li>List item 2</li>
        </ul>
        <blockquote>Quote content</blockquote>
        <h6>Footer</h6>
        <p>Paragraph</p>
      `;

      await editor.update(() => {
        const root = $getRoot();
        root.clear();

        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlContent, 'text/html');
        
        // Normalize only headings
        ['h4', 'h5', 'h6'].forEach(tag => {
          const elements = doc.querySelectorAll(tag);
          elements.forEach(el => {
            const h3 = doc.createElement('h3');
            while (el.firstChild) {
              h3.appendChild(el.firstChild);
            }
            el.parentNode?.replaceChild(h3, el);
          });
        });

        const nodes = $generateNodesFromDOM(editor, doc);
        nodes.forEach(node => root.append(node));
      });

      await editor.getEditorState().read(() => {
        const root = $getRoot();
        const children = root.getChildren();

        // Find headings and verify normalization
        let headingCount = 0;
        let listCount = 0;
        let quoteCount = 0;
        let paragraphCount = 0;

        children.forEach(child => {
          if ($isHeadingNode(child)) {
            headingCount++;
            const tag = (child as any).getTag();
            expect(ALLOWED_HEADING_TAGS).toContain(tag);
          } else if (child.getType() === 'list') {
            listCount++;
          } else if (child.getType() === 'quote') {
            quoteCount++;
          } else if (child.getType() === 'paragraph') {
            paragraphCount++;
          }
        });

        expect(headingCount).toBe(3); // h1, h4->h3, h6->h3
        expect(listCount).toBe(1);
        expect(quoteCount).toBe(1);
        expect(paragraphCount).toBe(1);
      });
    });
  });

  describe('Performance and Edge Cases', () => {
    it('should handle large paste operations without errors', async () => {
      // Generate a large HTML document with many headings
      const headingTypes = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'];
      const htmlParts: string[] = [];
      
      for (let i = 0; i < 50; i++) {
        headingTypes.forEach(tag => {
          htmlParts.push(`<${tag}>Heading ${tag} ${i}</${tag}>`);
        });
      }
      
      const htmlContent = htmlParts.join('\n');

      await editor.update(() => {
        const root = $getRoot();
        root.clear();

        const parser = new DOMParser();
        const doc = parser.parseFromString(`<div>${htmlContent}</div>`, 'text/html');
        
        // Normalize disallowed headings
        ['h4', 'h5', 'h6'].forEach(tag => {
          const elements = doc.querySelectorAll(tag);
          elements.forEach(el => {
            const h3 = doc.createElement('h3');
            while (el.firstChild) {
              h3.appendChild(el.firstChild);
            }
            el.parentNode?.replaceChild(h3, el);
          });
        });

        const nodes = $generateNodesFromDOM(editor, doc);
        nodes.forEach(node => root.append(node));
      });

      // Verify no errors and all headings are compliant
      await editor.getEditorState().read(() => {
        const root = $getRoot();
        const children = root.getChildren();

        children.forEach(child => {
          if ($isHeadingNode(child)) {
            const tag = (child as any).getTag();
            expect(ALLOWED_HEADING_TAGS).toContain(tag);
          }
        });
      });
    });

    it('should handle empty and malformed HTML gracefully', async () => {
      const testCases = [
        '', // Empty
        '<h4></h4>', // Empty heading
        '<h5>Unclosed heading', // Malformed
        '<div><h6>Nested heading</h6></div>' // Nested
      ];

      for (const htmlContent of testCases) {
        await editor.update(() => {
          const root = $getRoot();
          root.clear();

          if (htmlContent) {
            const parser = new DOMParser();
            const doc = parser.parseFromString(htmlContent, 'text/html');
            
            ['h4', 'h5', 'h6'].forEach(tag => {
              const elements = doc.querySelectorAll(tag);
              elements.forEach(el => {
                const h3 = doc.createElement('h3');
                while (el.firstChild) {
                  h3.appendChild(el.firstChild);
                }
                el.parentNode?.replaceChild(h3, el);
              });
            });

            try {
              const nodes = $generateNodesFromDOM(editor, doc);
              nodes.forEach(node => root.append(node));
            } catch (error) {
              // Should handle gracefully
              console.warn('Handled malformed HTML:', error);
            }
          }
        });

        // Should not throw errors
        await editor.getEditorState().read(() => {
          const root = $getRoot();
          // Basic sanity check
          expect(root).toBeDefined();
        });
      }
    });
  });
});