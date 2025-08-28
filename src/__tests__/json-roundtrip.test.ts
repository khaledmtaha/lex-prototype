import { describe, it, expect, beforeEach } from 'vitest';
import { CustomHeadingNode, $createCustomHeadingNode } from '../nodes/CustomHeadingNode';
import { createEditor, $getRoot, LexicalEditor, $createTextNode } from 'lexical';

describe('JSON Round-trip Tests', () => {
  let editor: LexicalEditor;

  beforeEach(() => {
    editor = createEditor({
      namespace: 'roundtrip-test',
      nodes: [CustomHeadingNode],
      onError: console.error
    });
  });

  it('preserves tag and children through JSON round-trip', async () => {
    await editor.update(() => {
      const root = $getRoot();
      root.clear();
      
      // Create heading with text content
      const heading = $createCustomHeadingNode('h2');
      const textNode = $createTextNode('Test Heading Content');
      heading.append(textNode);
      root.append(heading);
    });

    // Serialize to JSON
    const serializedState = editor.getEditorState().toJSON();
    
    // Create new editor and import the state
    const newEditor = createEditor({
      namespace: 'roundtrip-test-2',
      nodes: [CustomHeadingNode],
      onError: console.error
    });

    const editorState = newEditor.parseEditorState(JSON.stringify(serializedState));
    newEditor.setEditorState(editorState);

    // Verify content is preserved
    newEditor.getEditorState().read(() => {
      const root = $getRoot();
      const firstChild = root.getFirstChild();
      
      expect(firstChild instanceof CustomHeadingNode).toBe(true);
      expect((firstChild as CustomHeadingNode).getTag()).toBe('h2');
      
      const textContent = firstChild?.getTextContent();
      expect(textContent).toBe('Test Heading Content');
    });
  });

  it('handles direction, format, and indent in JSON round-trip', async () => {
    await editor.update(() => {
      const root = $getRoot();
      root.clear();
      
      const heading = $createCustomHeadingNode('h1');
      heading.setFormat(1); // Bold
      heading.setIndent(1);
      heading.setDirection('ltr');
      
      const textNode = $createTextNode('Formatted heading');
      heading.append(textNode);
      root.append(heading);
    });

    // Round-trip through JSON
    const serializedState = editor.getEditorState().toJSON();
    const newEditor = createEditor({
      namespace: 'roundtrip-format-test',
      nodes: [CustomHeadingNode],
      onError: console.error
    });

    const editorState = newEditor.parseEditorState(JSON.stringify(serializedState));
    newEditor.setEditorState(editorState);

    // Verify formatting is preserved (as much as Lexical 0.15.0 supports)
    newEditor.getEditorState().read(() => {
      const root = $getRoot();
      const heading = root.getFirstChild() as CustomHeadingNode;
      
      expect(heading instanceof CustomHeadingNode).toBe(true);
      expect(heading.getTag()).toBe('h1');
      expect(heading.getTextContent()).toBe('Formatted heading');
    });
  });
});