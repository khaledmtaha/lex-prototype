import Editor from './Editor'
import { useState, useRef } from 'react'

export default function App() {
  const [documentTitle, setDocumentTitle] = useState('Lexical Prototype')
  const [isEditingTitle, setIsEditingTitle] = useState(false)
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

  return (
    <div className="min-h-screen">
      <div className="container">
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
  )
}
