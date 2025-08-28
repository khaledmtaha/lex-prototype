import { LexicalEditor } from 'lexical';
import { $getSelection, $isRangeSelection, $createParagraphNode } from 'lexical';
import { $setBlocksType } from '@lexical/selection';
import { $createHeadingNode, $isHeadingNode } from '@lexical/rich-text';
import { $getNearestNodeOfType } from '@lexical/utils';
import { $isListItemNode, ListItemNode } from '@lexical/list';
import { BlockType, HeadingTagType } from '../types/editor-types';
import { isAllowedHeadingTag } from '../constants/heading-policy';
import { logCommandWarning } from '../utils/dev-logger';

/**
 * Format the selected blocks as a heading or paragraph.
 * Always blocks converting list items to maintain content structure.
 * Supports toggle behavior: clicking active heading switches to paragraph.
 * 
 * @returns true if the conversion was successful, false if blocked or failed
 */
export function formatHeading(
  editor: LexicalEditor,
  blockType: BlockType,
  options: { enableToggle?: boolean } = {}
): boolean {
  let success = false;
  
  // Early return if not editable
  if (!editor.isEditable()) {
    return false;
  }
  
  editor.update(() => {
    const selection = $getSelection();
    
    if (!$isRangeSelection(selection)) {
      return;
    }

    // Always guard list conversions - safer default policy
    const anchorNode = selection.anchor.getNode();
    const listItem = $getNearestNodeOfType(anchorNode, ListItemNode);
    
    if (listItem && blockType !== 'paragraph') {
      // Always block heading conversion inside list items for structural consistency
      logCommandWarning('Cannot convert list items to headings to maintain content structure.');
      return;
    }

    // Toggle behavior: if clicking the same heading type, convert to paragraph
    if (options.enableToggle && blockType !== 'paragraph') {
      const anchorNode = selection.anchor.getNode();
      const element = anchorNode.getTopLevelElementOrThrow();
      
      if ($isHeadingNode(element) && element.getTag() === blockType) {
        blockType = 'paragraph';
      }
    }

    // Validate heading tags
    if (blockType !== 'paragraph' && !isAllowedHeadingTag(blockType)) {
      logCommandWarning(`Heading tag ${blockType} is not allowed. Use h1, h2, or h3.`);
      return;
    }

    // Perform the conversion
    try {
      if (blockType === 'paragraph') {
        $setBlocksType(selection, () => $createParagraphNode());
      } else {
        $setBlocksType(selection, () => $createHeadingNode(blockType as HeadingTagType));
      }
      success = true;
    } catch (error) {
      logCommandWarning(`Failed to convert selection to ${blockType}: ${error}`);
    }
  });
  
  return success;
}