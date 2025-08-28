import { useEffect } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { 
  KEY_MODIFIER_COMMAND, 
  COMMAND_PRIORITY_HIGH
} from 'lexical';
import { formatHeading } from '../commands/heading-commands';
import { BlockType } from '../types/editor-types';

/**
 * Plugin that adds keyboard shortcuts for heading formatting:
 * - Mod+Alt+1: Convert to H1
 * - Mod+Alt+2: Convert to H2  
 * - Mod+Alt+3: Convert to H3
 * - Mod+Alt+0: Convert to Normal paragraph
 */
export function HeadingShortcutsPlugin(): null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return editor.registerCommand(
      KEY_MODIFIER_COMMAND,
      (event: KeyboardEvent) => {
        const { ctrlKey, metaKey, altKey, shiftKey, key } = event;
        const isModifier = ctrlKey || metaKey;

        if (isModifier && altKey && !shiftKey) {
          let blockType: BlockType | null = null;
          
          switch (key) {
            case '1':
              blockType = 'h1';
              break;
            case '2':
              blockType = 'h2';
              break;
            case '3':
              blockType = 'h3';
              break;
            case '0':
              blockType = 'paragraph';
              break;
            default:
              return false;
          }

          if (blockType) {
            event.preventDefault();
            const success = formatHeading(editor, blockType);
            
            // Could add user feedback here based on success
            if (!success && import.meta.env.DEV) {
              console.warn(`[HeadingShortcuts] Failed to convert to ${blockType}`);
            }
            
            return true;
          }
        }
        
        return false;
      },
      COMMAND_PRIORITY_HIGH
    );
  }, [editor]);

  return null;
}