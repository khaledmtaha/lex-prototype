import React from 'react'
import { LexicalComposer } from '@lexical/react/LexicalComposer'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin'
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin'
import { ListPlugin } from '@lexical/react/LexicalListPlugin'
import { ContentEditable } from '@lexical/react/LexicalContentEditable'
import { ParagraphNode, TextNode } from 'lexical'
import { QuoteNode } from '@lexical/rich-text'
import { ListNode, ListItemNode } from '@lexical/list'
import { CodeNode } from '@lexical/code'
import { 
  $getRoot, 
  $createParagraphNode, 
  $createTextNode 
} from 'lexical'
import { 
  $createQuoteNode 
} from '@lexical/rich-text'
import { 
  $createListNode, 
  $createListItemNode 
} from '@lexical/list'
import { $createCodeNode } from '@lexical/code'
import { HeadingNode, $createHeadingNode } from '@lexical/rich-text'
import { editorConfig } from './config/editor-config'
import Toolbar from './plugins/Toolbar'
import FloatingToolbar from './plugins/FloatingToolbar'
import { HeadingPolicyPlugin } from './plugins/HeadingPolicyPlugin'
import { HeadingShortcutsPlugin } from './plugins/HeadingShortcutsPlugin'
import { SmartPastePlugin } from './plugins/SmartPastePlugin'
import { ListItemNormalizationPlugin } from './plugins/ListItemNormalizationPlugin'
import { patchLexicalWarnings } from './lexicalPatches'

// Note: Using editorConfig for node registration to ensure CustomHeadingNode is used

// Function to create example content with all formatting
function prepopulateEditorState(editor: any) {
  editor.update(() => {
    const root = $getRoot()
    if (root.getFirstChild() === null) {
      // H2 Heading
      const heading = $createHeadingNode('h2')
      heading.append($createTextNode('Rich Text Editor Demo'))
      root.append(heading)

      // Regular paragraph with mixed formatting
      const paragraph1 = $createParagraphNode()
      paragraph1.append($createTextNode('This paragraph shows '))
      
      const boldText = $createTextNode('bold text')
      boldText.setFormat('bold')
      paragraph1.append(boldText)
      
      paragraph1.append($createTextNode(', '))
      
      const italicText = $createTextNode('italic text')
      italicText.setFormat('italic')
      paragraph1.append(italicText)
      
      paragraph1.append($createTextNode(', and '))
      
      const codeText = $createTextNode('inline code')
      codeText.setFormat('code')
      paragraph1.append(codeText)
      
      paragraph1.append($createTextNode(' formatting.'))
      root.append(paragraph1)

      // Quote block
      const quote = $createQuoteNode()
      quote.append($createTextNode('This is a quote block. It should have different styling than regular paragraphs.'))
      root.append(quote)

      // Bulleted list
      const list = $createListNode('bullet')
      
      const listItem1 = $createListItemNode()
      listItem1.append($createTextNode('First bullet point'))
      list.append(listItem1)
      
      const listItem2 = $createListItemNode()
      listItem2.append($createTextNode('Second bullet point with '))
      const listBoldText = $createTextNode('bold text')
      listBoldText.setFormat('bold')
      listItem2.append(listBoldText)
      list.append(listItem2)
      
      const listItem3 = $createListItemNode()
      listItem3.append($createTextNode('Third bullet point'))
      list.append(listItem3)
      
      root.append(list)

      // Code block
      const codeBlock = $createCodeNode()
      codeBlock.append($createTextNode('// This is a code block\nfunction example() {\n  return "Hello World";\n}'))
      root.append(codeBlock)

      // Final paragraph
      const paragraph2 = $createParagraphNode()
      paragraph2.append($createTextNode('Try using the toolbar above to format text or change block types.'))
      root.append(paragraph2)
    }
  })
}

// Use our custom editor config with restricted heading levels
const initialConfig = {
  ...editorConfig,
  namespace: 'flow', // Keep existing namespace
  editorState: null
}

export default function Editor() {
  // Quiet known 0.15.x dev warnings for ArtificialNode
  patchLexicalWarnings()
  
  return (
    <LexicalComposer initialConfig={initialConfig}>
      <div className="editor-wrapper">
        <Toolbar />
        <RichTextPlugin 
          contentEditable={<ContentEditable className="editor-content" />} 
          placeholder={<div />}
          ErrorBoundary={() => <div>Error loading editor</div>}
        />
      </div>
      <HistoryPlugin />
      <ListPlugin />
      <SmartPastePlugin />
      <HeadingPolicyPlugin />
      <ListItemNormalizationPlugin />
      <HeadingShortcutsPlugin />
      <FloatingToolbar />
      <ExampleContentPlugin />
    </LexicalComposer>
  )
}

// Plugin to add example content on first load
function ExampleContentPlugin() {
  const [editor] = useLexicalComposerContext()
  
  React.useEffect(() => {
    prepopulateEditorState(editor)
  }, [editor])
  
  return null
}
