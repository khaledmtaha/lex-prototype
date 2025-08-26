import {useEffect, useState, useCallback} from 'react'
import {useLexicalComposerContext} from '@lexical/react/LexicalComposerContext'
import {
  $getSelection,
  $isRangeSelection,
  FORMAT_TEXT_COMMAND,
  SELECTION_CHANGE_COMMAND,
  COMMAND_PRIORITY_CRITICAL,
} from 'lexical'
import {$setBlocksType} from '@lexical/selection'
import {
  $createHeadingNode,
  $isHeadingNode,
  $createQuoteNode,
  $isQuoteNode,
} from '@lexical/rich-text'
import {INSERT_UNORDERED_LIST_COMMAND, REMOVE_LIST_COMMAND, $isListNode} from '@lexical/list'
import {$createParagraphNode, $isParagraphNode} from 'lexical'
import {$createCodeNode, $isCodeNode} from '@lexical/code'

type BlockType = 'paragraph' | 'h2' | 'bullet' | 'quote' | 'code'

export default function Toolbar() {
  const [editor] = useLexicalComposerContext()
  const [isBold, setIsBold] = useState(false)
  const [isItalic, setIsItalic] = useState(false)
  const [isCodeMark, setIsCodeMark] = useState(false)
  const [blockType, setBlockType] = useState<BlockType>('paragraph')

  const updateToolbar = useCallback(() => {
    editor.getEditorState().read(() => {
      const selection = $getSelection()
      if (!$isRangeSelection(selection)) return

      setIsBold(selection.hasFormat('bold'))
      setIsItalic(selection.hasFormat('italic'))
      setIsCodeMark(selection.hasFormat('code'))

      const anchor = selection.anchor.getNode()
      const element = anchor.getTopLevelElementOrThrow()

      if ($isHeadingNode(element)) {
        setBlockType(element.getTag() === 'h2' ? 'h2' : 'paragraph')
      } else if ($isListNode(element)) {
        setBlockType(element.getListType() === 'bullet' ? 'bullet' : 'paragraph')
      } else if ($isQuoteNode(element)) {
        setBlockType('quote')
      } else if ($isCodeNode(element)) {
        setBlockType('code')
      } else if ($isParagraphNode(element)) {
        setBlockType('paragraph')
      } else {
        setBlockType('paragraph')
      }
    })
  }, [editor])

  useEffect(() => {
    return editor.registerCommand(
      SELECTION_CHANGE_COMMAND,
      () => {
        updateToolbar()
        return false
      },
      COMMAND_PRIORITY_CRITICAL,
    )
  }, [editor, updateToolbar])

  useEffect(() => {
    return editor.registerUpdateListener(({editorState}) => {
      editorState.read(() => updateToolbar())
    })
  }, [editor, updateToolbar])

  const onToggleFormat = (format: 'bold' | 'italic' | 'code') => {
    editor.dispatchCommand(FORMAT_TEXT_COMMAND, format)
  }

  const onSelectBlock = (type: BlockType) => {
    if (type === 'bullet') {
      // Toggle bulleted list
      editor.update(() => {
        const selection = $getSelection()
        if ($isRangeSelection(selection)) {
          const anchor = selection.anchor.getNode()
          const element = anchor.getTopLevelElementOrThrow()
          if ($isListNode(element) && element.getListType() === 'bullet') {
            editor.dispatchCommand(REMOVE_LIST_COMMAND, undefined)
          } else {
            editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined)
          }
        }
      })
      return
    }

    editor.update(() => {
      const selection = $getSelection()
      if (!$isRangeSelection(selection)) return
      switch (type) {
        case 'paragraph':
          $setBlocksType(selection, () => $createParagraphNode())
          break
        case 'h2':
          $setBlocksType(selection, () => $createHeadingNode('h2'))
          break
        case 'quote':
          $setBlocksType(selection, () => $createQuoteNode())
          break
        case 'code':
          $setBlocksType(selection, () => $createCodeNode())
          break
      }
    })
  }

  return (
    <div className="toolbar" role="toolbar" aria-label="Formatting toolbar">
      <button
        type="button"
        className={`toolbar-btn ${isBold ? 'active' : ''}`}
        aria-pressed={isBold}
        onClick={() => onToggleFormat('bold')}
        title="Bold"
      >
        B
      </button>
      <button
        type="button"
        className={`toolbar-btn ${isItalic ? 'active' : ''}`}
        aria-pressed={isItalic}
        onClick={() => onToggleFormat('italic')}
        title="Italic"
      >
        I
      </button>
      <button
        type="button"
        className={`toolbar-btn ${isCodeMark ? 'active' : ''}`}
        aria-pressed={isCodeMark}
        onClick={() => onToggleFormat('code')}
        title="Inline code"
      >
        {'</>'}
      </button>
      <div className="toolbar-spacer" />
      <label className="sr-only" htmlFor="blockType">Block type</label>
      <select
        id="blockType"
        className="toolbar-select"
        value={blockType}
        onChange={(e) => onSelectBlock(e.target.value as BlockType)}
        title="Block type"
      >
        <option value="paragraph">Paragraph</option>
        <option value="h2">H2</option>
        <option value="bullet">Bulleted</option>
        <option value="quote">Quote</option>
        <option value="code">Code</option>
      </select>
    </div>
  )
}
