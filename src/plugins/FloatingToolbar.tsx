import { useEffect, useState, useRef } from 'react'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import {
  $getSelection,
  $isRangeSelection,
  FORMAT_TEXT_COMMAND,
  SELECTION_CHANGE_COMMAND,
  COMMAND_PRIORITY_LOW,
} from 'lexical'
import {
  INSERT_UNORDERED_LIST_COMMAND,
  REMOVE_LIST_COMMAND,
  $isListNode,
} from '@lexical/list'
import {
  $createQuoteNode,
  $isQuoteNode,
} from '@lexical/rich-text'
import { $createHeadingNode, $isHeadingNode } from '@lexical/rich-text'
// Note: useLexicalIsEditable not available in current version
import { isAllowedHeadingTag } from '../constants/heading-policy'
import { formatHeading } from '../commands/heading-commands'
import { $setBlocksType } from '@lexical/selection'
import { $createParagraphNode } from 'lexical'
import { $createCodeNode, $isCodeNode } from '@lexical/code'

// SVG Icons
const ChevronDownIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="6 9 12 15 18 9"></polyline>
  </svg>
)

const DropdownChevronIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 30 30" style={{width: '10px', height: '100%', display: 'block', fill: 'currentColor', flexShrink: 0, marginLeft: '4px'}}>
    <polygon points="15,17.4 4.8,7 2,9.8 15,23 28,9.8 25.2,7"></polygon>
  </svg>
)

type BlockType = 'paragraph' | 'h1' | 'h2' | 'h3' | 'quote' | 'code' | 'bullet'

const BLOCKS: {label: string; type: BlockType}[] = [
  {label: 'Paragraph', type: 'paragraph'},
  {label: 'Heading 1', type: 'h1'},
  {label: 'Heading 2', type: 'h2'},
  {label: 'Heading 3', type: 'h3'},
  {label: 'Quote', type: 'quote'},
  {label: 'Code Block', type: 'code'},
  {label: 'Bullet List', type: 'bullet'},
]

export default function FloatingToolbar() {
  const [editor] = useLexicalComposerContext()
  const toolbarRef = useRef<HTMLDivElement>(null)
  
  // State
  const [isVisible, setIsVisible] = useState(false)
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const [isBold, setIsBold] = useState(false)
  const [isItalic, setIsItalic] = useState(false)
  const [isCode, setIsCode] = useState(false)
  const [blockType, setBlockType] = useState<BlockType>('paragraph')
  const [position, setPosition] = useState({ top: 0, left: 0 })
  
  // Handle block type changes with unified command usage
  const handleBlockTypeChange = (type: BlockType) => {
    // Guard: Check if editor is editable
    if (!editor.isEditable()) {
      if (import.meta.env.DEV) {
        console.warn('[FloatingToolbar] Block type change blocked: editor is read-only');
      }
      return;
    }
    
    // Use formatHeading for all heading and paragraph changes
    if (type === 'paragraph' || ['h1', 'h2', 'h3'].includes(type)) {
      const success = formatHeading(editor, type, { enableToggle: true })
      if (!success && import.meta.env.DEV) {
        console.warn(`[FloatingToolbar] Failed to change block type to ${type}`)
      }
      editor.focus()
      return
    }
    
    // Handle other block types directly
    editor.update(() => {
      const selection = $getSelection()
      if (!$isRangeSelection(selection)) return
      
      switch (type) {
        case 'quote':
          $setBlocksType(selection, () => $createQuoteNode())
          break
        case 'code':
          $setBlocksType(selection, () => $createCodeNode())
          break
        case 'bullet': {
          const anchor = selection.anchor.getNode()
          const element = anchor.getTopLevelElementOrThrow()
          if ($isListNode(element) && element.getListType() === 'bullet') {
            editor.dispatchCommand(REMOVE_LIST_COMMAND, undefined)
          } else {
            editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined)
          }
          break
        }
      }
    })
    
    editor.focus()
  }
  
  // Update toolbar visibility based on selection
  const updateToolbarState = () => {
    editor.getEditorState().read(() => {
      const selection = $getSelection()
      
      // Show toolbar only for non-collapsed range selections AND when editor is editable
      if ($isRangeSelection(selection) && !selection.isCollapsed() && editor.isEditable()) {
        setIsVisible(true)
        
        // Update format states
        setIsBold(selection.hasFormat('bold'))
        setIsItalic(selection.hasFormat('italic'))
        setIsCode(selection.hasFormat('code'))
        
        // Update block type
        const anchor = selection.anchor.getNode()
        let element = null
        
        try {
          element = anchor.getTopLevelElementOrThrow()
        } catch (e) {
          // If getTopLevelElementOrThrow fails, try to find the parent block
          let node = anchor
          while (node && !node.isTopLevelElement()) {
            node = node.getParent()
          }
          element = node
        }
        
        if (!element) {
          setBlockType('paragraph')
        } else if ($isCodeNode(element)) {
          setBlockType('code')
        } else if ($isHeadingNode(element)) {
          const tag = element.getTag()
          if (isAllowedHeadingTag(tag)) {
            setBlockType(tag)
          } else {
            // This shouldn't happen due to policy, but handle gracefully
            setBlockType('h3') // Show as h3 since that's what it will be normalized to
          }
        } else if ($isQuoteNode(element)) {
          setBlockType('quote')
        } else if ($isListNode(element) && element.getListType() === 'bullet') {
          setBlockType('bullet')
        } else {
          setBlockType('paragraph')
        }
      } else {
        setIsVisible(false)
      }
    })
  }
  
  // Position the toolbar above/below selection
  const positionToolbar = () => {
    const nativeSelection = window.getSelection()
    if (!nativeSelection || nativeSelection.rangeCount === 0) return
    
    const range = nativeSelection.getRangeAt(0)
    const rect = range.getBoundingClientRect()
    
    if (!rect || rect.width === 0) return
    
    const toolbarElement = toolbarRef.current
    if (!toolbarElement) return
    
    // Get toolbar dimensions
    const toolbarRect = toolbarElement.getBoundingClientRect()
    const toolbarHeight = toolbarRect.height
    const toolbarWidth = toolbarRect.width
    
    // Calculate position
    let top = rect.top - toolbarHeight - 8 // 8px gap above selection
    let left = rect.left + (rect.width / 2) - (toolbarWidth / 2)
    
    // Flip below if too close to top
    if (top < 8) {
      top = rect.bottom + 8
    }
    
    // Clamp to viewport with 8px padding
    left = Math.max(8, Math.min(left, window.innerWidth - toolbarWidth - 8))
    top = Math.max(8, top)
    
    // Account for scroll
    top += window.scrollY
    left += window.scrollX
    
    setPosition({ top, left })
  }
  
  // Handle click outside dropdown
  useEffect(() => {
    if (isDropdownOpen) {
      const handleClickOutside = (e: MouseEvent) => {
        if (toolbarRef.current && !toolbarRef.current.contains(e.target as Node)) {
          setIsDropdownOpen(false)
        }
      }
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isDropdownOpen])
  
  // Register listeners
  useEffect(() => {
    // Selection change listener
    const unregisterSelection = editor.registerCommand(
      SELECTION_CHANGE_COMMAND,
      () => {
        updateToolbarState()
        setTimeout(() => {
          if (isVisible) positionToolbar()
        }, 0)
        return false
      },
      COMMAND_PRIORITY_LOW
    )
    
    // Update listener for content changes
    const unregisterUpdate = editor.registerUpdateListener(() => {
      updateToolbarState()
    })
    
    return () => {
      unregisterSelection()
      unregisterUpdate()
    }
  }, [editor, isVisible])
  
  // Handle scroll and resize
  useEffect(() => {
    if (!isVisible) return
    
    const handlePositionUpdate = () => {
      positionToolbar()
    }
    
    // Use passive listeners for better performance
    window.addEventListener('scroll', handlePositionUpdate, { passive: true })
    window.addEventListener('resize', handlePositionUpdate, { passive: true })
    
    // Initial positioning
    positionToolbar()
    
    return () => {
      window.removeEventListener('scroll', handlePositionUpdate)
      window.removeEventListener('resize', handlePositionUpdate)
    }
  }, [isVisible])
  
  if (!isVisible) return null
  
  return (
    <div 
      ref={toolbarRef}
      className="floating-toolbar"
      style={{
        position: 'absolute',
        top: `${position.top}px`,
        left: `${position.left}px`,
        zIndex: 1000,
      }}
    >
      <div className="floating-toolbar-content">
        {/* Block type dropdown */}
        <div className="relative">
          <button 
            className="floating-toolbar-dropdown"
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            onMouseDown={(e) => e.preventDefault()} // Prevent selection loss
          >
            <span>{BLOCKS.find(b => b.type === blockType)?.label || 'Paragraph'}</span>
            <DropdownChevronIcon />
          </button>
          {isDropdownOpen && (
            <div className="floating-toolbar-dropdown-menu">
              {BLOCKS.map((block) => (
                <button
                  key={block.type}
                  className={`floating-toolbar-dropdown-item ${blockType === block.type ? 'active' : ''}`}
                  onClick={() => {
                    handleBlockTypeChange(block.type)
                    setIsDropdownOpen(false)
                  }}
                  onMouseDown={(e) => e.preventDefault()} // Prevent selection loss
                >
                  {block.label}
                </button>
              ))}
            </div>
          )}
        </div>
        
        {/* Format buttons */}
        <button 
          className={`floating-toolbar-btn ${isBold ? 'active' : ''}`}
          onClick={() => {
            editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'bold')
            editor.focus()
          }}
          onMouseDown={(e) => e.preventDefault()}
        >
          B
        </button>
        <button 
          className={`floating-toolbar-btn ${isItalic ? 'active' : ''}`}
          onClick={() => {
            editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'italic')
            editor.focus()
          }}
          onMouseDown={(e) => e.preventDefault()}
        >
          I
        </button>
        <button 
          className={`floating-toolbar-btn ${isCode ? 'active' : ''}`}
          onClick={() => {
            editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'code')
            editor.focus()
          }}
          onMouseDown={(e) => e.preventDefault()}
        >
          &lt;/&gt;
        </button>
      </div>
    </div>
  )
}