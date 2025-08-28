import { useState, useEffect, useRef } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { 
  $getSelection, 
  $isRangeSelection,
  COMMAND_PRIORITY_CRITICAL,
  SELECTION_CHANGE_COMMAND
} from 'lexical';
import { $isListNode } from '@lexical/list';
import { BlockType } from '../types/editor-types';
import { CustomHeadingNode } from '../nodes/CustomHeadingNode';

/**
 * Hook to detect the current block type at the selection.
 * Uses the custom heading node for proper type detection.
 */
export function useBlockType(): BlockType {
  const [editor] = useLexicalComposerContext();
  const [blockType, setBlockType] = useState<BlockType>('paragraph');
  const previousBlockTypeRef = useRef<BlockType>(blockType);

  useEffect(() => {
    return editor.registerCommand(
      SELECTION_CHANGE_COMMAND,
      () => {
        const selection = $getSelection();
        
        if (!$isRangeSelection(selection)) {
          return false;
        }

        const anchorNode = selection.anchor.getNode();
        let element;
        
        try {
          element = anchorNode.getTopLevelElementOrThrow();
        } catch {
          return false;
        }

        let newBlockType: BlockType = 'paragraph';

        // Use custom heading node check
        if (element instanceof CustomHeadingNode) {
          const tag = element.getTag();
          if (tag === 'h1' || tag === 'h2' || tag === 'h3') {
            newBlockType = tag;
          }
        } else if ($isListNode(element)) {
          // Show lists as 'paragraph' in the heading toolbar
          newBlockType = 'paragraph';
        }
        
        // Only update if changed to prevent unnecessary re-renders
        if (newBlockType !== previousBlockTypeRef.current) {
          previousBlockTypeRef.current = newBlockType;
          setBlockType(newBlockType);
        }

        return false;
      },
      COMMAND_PRIORITY_CRITICAL
    );
  }, [editor]);

  return blockType;
}