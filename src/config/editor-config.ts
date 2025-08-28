import { HeadingNode, QuoteNode } from '@lexical/rich-text';
import { ListNode, ListItemNode } from '@lexical/list';
import { CodeNode } from '@lexical/code';
import { ParagraphNode, TextNode } from 'lexical';
import theme from '../theme';

export const editorConfig = {
  namespace: 'ProductionEditor',
  nodes: [
    HeadingNode, // Stock node with policy enforced via HeadingPolicyPlugin
    ParagraphNode,
    TextNode,
    QuoteNode,
    ListNode,
    ListItemNode,
    CodeNode,
  ],
  theme: {
    ...theme,
    heading: {
      h1: 'editor-h1',
      h2: 'editor-h2', 
      h3: 'editor-h3',
    }
  },
  onError: (error: Error) => {
    console.error('Lexical error:', error);
  }
};