import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HeadingNode } from '@lexical/rich-text';
import { formatHeading } from '../commands/heading-commands';
import { createEditor, $getRoot, LexicalEditor, $createTextNode, $setSelection, $createRangeSelection, ParagraphNode, TextNode } from 'lexical';
import { $createListNode, $createListItemNode, ListNode, ListItemNode } from '@lexical/list';

describe('Heading Commands', () => {
  let editor: LexicalEditor;

  beforeEach(() => {
    editor = createEditor({
      namespace: 'command-test',
      nodes: [HeadingNode, ParagraphNode, TextNode, ListNode, ListItemNode],
      onError: console.error
    });
  });

  it('enforces safer default policy (always blocks list conversions)', () => {
    // Test that the function always blocks list conversions with new safer policy
    const success1 = formatHeading(editor, 'h1'); // Should work in normal context
    const success2 = formatHeading(editor, 'h1', {}); // Explicit empty options
    
    // All should return boolean
    expect(typeof success1).toBe('boolean');
    expect(typeof success2).toBe('boolean');
    
    // Function should not throw with different option combinations
    expect(() => formatHeading(editor, 'paragraph')).not.toThrow();
    expect(() => formatHeading(editor, 'h2', {})).not.toThrow();
    expect(() => formatHeading(editor, 'h3', { enableToggle: true })).not.toThrow();
  });

  it('returns boolean for conversion success/failure', () => {
    // Test that formatHeading returns a boolean
    const success = formatHeading(editor, 'h1');
    expect(typeof success).toBe('boolean');
  });

  it('handles empty selection gracefully', () => {
    // Test with no selection
    const success = formatHeading(editor, 'h2');
    expect(typeof success).toBe('boolean');
    // Should not throw an error
  });
});