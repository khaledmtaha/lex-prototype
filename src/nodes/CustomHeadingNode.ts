import { 
  HeadingNode, 
  SerializedHeadingNode 
} from '@lexical/rich-text';
import { 
  DOMConversionMap, 
  DOMConversionOutput, 
  NodeKey,
  $createParagraphNode
} from 'lexical';
import { HeadingTagType } from '../types/editor-types';
import { logHeadingWarning } from '../utils/dev-logger';

// DRY constants to avoid drift across methods
const ALLOWED_TAGS: readonly HeadingTagType[] = ['h1', 'h2', 'h3'] as const;
const ALL_HEADING_TAGS: readonly string[] = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] as const;

/**
 * CustomHeadingNode extends HeadingNode to limit supported heading levels to H1-H3.
 * H4-H6 are explicitly blocked during import/paste operations and remapped in JSON imports.
 */
export class CustomHeadingNode extends HeadingNode {
  static getType(): string {
    return 'heading';
  }

  static clone(node: CustomHeadingNode): CustomHeadingNode {
    return new CustomHeadingNode(node.getTag(), node.getKey());
  }

  /**
   * Guard against importing disallowed heading levels from JSON (saved documents).
   * H4-H6 are downgraded to H3 to preserve content without data loss.
   */
  static importJSON(serializedNode: SerializedHeadingNode): CustomHeadingNode {
    const { tag, format, indent, direction } = serializedNode;
    
    // Only allow h1, h2, h3
    if (ALLOWED_TAGS.includes(tag as HeadingTagType)) {
      const node = new CustomHeadingNode(tag as HeadingTagType);
      if (typeof format === 'number') {
        node.setFormat(format);
      }
      if (typeof indent === 'number') {
        node.setIndent(indent);
      }
      if (direction != null) {
        node.setDirection(direction);
      }
      return node;
    }
    
    // Downgrade h4-h6 to h3 to preserve content
    logHeadingWarning(`Heading level ${tag} is not supported. Converting to h3.`);
    const node = new CustomHeadingNode('h3');
    if (typeof format === 'number') {
      node.setFormat(format);
    }
    if (typeof indent === 'number') {
      node.setIndent(indent);
    }
    if (direction != null) {
      node.setDirection(direction);
    }
    return node;
  }

  exportJSON(): SerializedHeadingNode {
    return {
      ...super.exportJSON(),
      tag: this.getTag(),
      version: 1,
    };
  }

  static importDOM(): DOMConversionMap | null {
    const domMap: DOMConversionMap = {};
    
    // Create conversion entries for all heading tags
    ALL_HEADING_TAGS.forEach(tag => {
      domMap[tag] = () => ({
        conversion: convertHeadingElement,
        priority: 1
      });
    });
    
    return domMap;
  }

  constructor(tag: HeadingTagType, key?: NodeKey) {
    super(tag, key);
  }

  /**
   * Override insertNewAfter to use our custom factory function
   * instead of the default $createHeadingNode from @lexical/rich-text
   */
  insertNewAfter(): CustomHeadingNode {
    const newNode = $createCustomHeadingNode(this.getTag());
    this.insertAfter(newNode);
    return newNode;
  }
}

function convertHeadingElement(element: HTMLElement): DOMConversionOutput {
  const tag = element.tagName.toLowerCase();
  
  // Allow h1, h2, h3 as-is
  if (ALLOWED_TAGS.includes(tag as HeadingTagType)) {
    return {
      node: $createCustomHeadingNode(tag as HeadingTagType),
    };
  }
  
  // Downcast h4, h5, h6 to h3 to preserve content
  if (ALL_HEADING_TAGS.includes(tag)) {
    logHeadingWarning(`Pasted heading level ${tag} is not supported. Converting to h3.`);
    return {
      node: $createCustomHeadingNode('h3'),
    };
  }
  
  // This shouldn't happen, but return null for safety
  return { node: null };
}

/**
 * Factory function to create CustomHeadingNode instances.
 * This ensures all heading nodes use our custom class with h1-h3 restrictions.
 */
export function $createCustomHeadingNode(tag: HeadingTagType): CustomHeadingNode {
  return new CustomHeadingNode(tag);
}

/**
 * Type guard to check if a node is a CustomHeadingNode.
 */
export function $isCustomHeadingNode(node: unknown): node is CustomHeadingNode {
  return node instanceof CustomHeadingNode;
}