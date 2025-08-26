import Editor from './Editor'
import ChatSidebar from './components/ChatSidebar'
import { useState, useRef } from 'react'

export default function App() {
  const [documentTitle, setDocumentTitle] = useState('Lexical Prototype')
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [isChatVisible, setIsChatVisible] = useState(true)
  const titleRef = useRef<HTMLHeadingElement>(null)

  const handleTitleClick = () => {
    setIsEditingTitle(true)
    setTimeout(() => {
      if (titleRef.current) {
        titleRef.current.focus()
        // Select all text
        const range = document.createRange()
        range.selectNodeContents(titleRef.current)
        const selection = window.getSelection()
        selection?.removeAllRanges()
        selection?.addRange(range)
      }
    }, 0)
  }

  const handleTitleBlur = () => {
    setIsEditingTitle(false)
    const newTitle = titleRef.current?.textContent?.trim() || ''
    if (newTitle === '') {
      titleRef.current!.textContent = ''
    }
    setDocumentTitle(newTitle || 'New Page')
  }

  const handleTitleInput = () => {
    const newTitle = titleRef.current?.textContent?.trim() || ''
    setDocumentTitle(newTitle || 'New Page')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      titleRef.current?.blur()
    }
  }

  const titleClasses = [
    isEditingTitle ? 'editing' : '',
    documentTitle === 'New Page' || documentTitle === '' ? 'empty' : ''
  ].filter(Boolean).join(' ')

  // AI Writing Assistant response generator
  const generateWritingResponse = async (userMessage: string): Promise<string> => {
    // Simulate AI response - replace with your actual AI integration
    await new Promise(resolve => setTimeout(resolve, 1000))
    
    return `
      <h1>Heading 1</h1>
      <h2>Heading 2</h2>
      <h3>Heading 3</h3>
      
      <p>This paragraph demonstrates the base .llm-response style. It includes <strong>bold text</strong>, <em>italic text</em>, and <del>strikethrough</del>. You can also include a <a href="https://google.com" target="_blank">link to Google</a>.</p>
      
      <blockquote>
        <p>This is a blockquote. It's useful for highlighting a section of text or a quote from another source. It has a distinct style to set it apart from regular paragraphs.</p>
      </blockquote>
      
      <h3>Lists and Code</h3>
      <ul>
        <li>This is an unordered list item.</li>
        <li>You can include <code>inline code</code> within a list item.</li>
      </ul>
      
      <ol>
        <li>This is an ordered list item.</li>
        <li>They are automatically numbered.</li>
      </ol>
      
      <pre><code>/* This is a full code block example */
.llm-response code {
    font-family: monospace;
    font-size: 11.2px;
}</code></pre>
      
      <h3>Table Example</h3>
      <table>
        <tr>
          <th>Feature</th>
          <th>Status</th>
          <th>Notes</th>
        </tr>
        <tr>
          <td>Headings</td>
          <td>Complete</td>
          <td>H1, H2, H3, etc. are styled.</td>
        </tr>
        <tr>
          <td>Tables</td>
          <td>Complete</td>
          <td>Tables have borders and padding.</td>
        </tr>
        <tr>
          <td>Blockquotes</td>
          <td>Complete</td>
          <td>Styled with a left border.</td>
        </tr>
      </table>
    `
  }

  return (
    <div className="flex min-h-screen">
      <div className="flex-1">
        <div className="container">
          {/* Chat Toggle for Mobile */}
          <div className="lg:hidden mb-4">
            <button
              onClick={() => setIsChatVisible(!isChatVisible)}
              className="bg-blue-500 text-white px-4 py-2 rounded-md text-sm hover:bg-blue-600"
            >
              {isChatVisible ? 'Hide Chat' : 'Show Chat'}
            </button>
          </div>
          
          <nav className="breadcrumb-nav">
            <div className="breadcrumb">
              <a href="#" onClick={(e) => e.preventDefault()}>Work</a>
              <span className="breadcrumb-separator">/</span>
              <a href="#" onClick={(e) => e.preventDefault()}>Reviews</a>
              <span className="breadcrumb-separator">/</span>
              <span className="link">{documentTitle}</span>
            </div>
          </nav>
          <h1
            ref={titleRef}
            contentEditable
            suppressContentEditableWarning
            className={titleClasses}
            onClick={handleTitleClick}
            onBlur={handleTitleBlur}
            onInput={handleTitleInput}
            onKeyDown={handleKeyDown}
          >
            {documentTitle === 'New Page' ? '' : documentTitle}
          </h1>
          <div>
            <p className="metadata">
              Created 17 days ago • Last modified 17 hours ago
            </p>
          </div>
          <hr />
          <Editor />
        </div>
      </div>
      
      {/* Chat Sidebar */}
      <ChatSidebar
        title="Chat"
        isVisible={isChatVisible}
        onClose={() => setIsChatVisible(false)}
        width={350}
        placeholder="Ask about your writing..."
        generateResponse={generateWritingResponse}
        showActionButtons={true}
        className={`
          ${!isChatVisible ? 'hidden' : ''}
          fixed lg:relative
          right-0 top-0
          h-full lg:h-auto
          z-40 lg:z-auto
          shadow-lg lg:shadow-none
        `}
      />
    </div>
  )
}
