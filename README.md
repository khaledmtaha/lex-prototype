# Lexical Editor Prototype

A rich text editor built with [Lexical](https://lexical.dev/) featuring a robust heading policy system.

## Features

### 🎯 Heading Policy System
- **H1-H3 Only**: Automatically normalizes h4-h6 headings to h3 to maintain consistent document structure
- **Content Preservation**: All text, formatting, and attributes preserved during normalization
- **Universal Coverage**: Works for paste, JSON import, and programmatic content insertion
- **Safe Defaults**: Blocks heading conversion inside list items to prevent structural issues

### 🔧 Architecture
- **Composition over Inheritance**: Uses stock HeadingNode with HeadingPolicyPlugin transform
- **Single Source of Truth**: One transform enforces policy across all content sources
- **Singleton Pattern**: Prevents duplicate registrations in development mode
- **Comprehensive Testing**: 42 tests covering commands, transforms, and edge cases

## Getting Started

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Run tests
npm test

# Build for production
npm run build
```

## Usage

### Basic Editor
The editor automatically enforces the H1-H3 heading policy:

```tsx
import Editor from './Editor'

function App() {
  return <Editor />
}
```

### Heading Commands
```tsx
import { formatHeading } from './commands/heading-commands'

// Convert selection to heading
formatHeading(editor, 'h1')

// With toggle behavior (h1 → paragraph if already h1)
formatHeading(editor, 'h1', { enableToggle: true })
```

### Policy Configuration
```tsx
// Constants defining allowed headings
import { ALLOWED_HEADING_TAGS } from './constants/heading-policy'

console.log(ALLOWED_HEADING_TAGS) // ['h1', 'h2', 'h3']
```

## How It Works

### Heading Normalization
1. **Any h4-h6 content** (from paste, import, or code) → **automatically becomes h3**
2. **Formatting preserved**: bold, italic, indentation, direction maintained
3. **Content preserved**: all text and inline elements transferred
4. **One undo step**: paste + normalization = single undo operation

### Policy Enforcement
- **Transform-based**: Runs after any editor update regardless of content source
- **Idempotent**: Safe to run multiple times, no infinite loops
- **Tree Invariant**: Guarantees no h4-h6 headings exist in final document

## Testing

```bash
# Run all tests
npm test

# Run specific test suite  
npm test heading

# Run with coverage
npm test -- --coverage
```

### Test Categories
- **Commands**: formatHeading behavior and edge cases
- **Policy Enforcement**: Transform normalization and content preservation  
- **Guards**: Read-only mode and list item protection
- **Tree Invariants**: Document-wide heading validation
- **Integration**: End-to-end user workflows

## Architecture Decisions

### Why Composition over Inheritance?
- **Maintainability**: No custom node classes to maintain across Lexical upgrades
- **Compatibility**: Full interoperability with ecosystem plugins
- **Simplicity**: Single transform is easier to understand and test than custom node logic

### Why Transform-Only (No Paste Interceptor)?
- **Reliability**: Transform catches all content regardless of source
- **Simplicity**: 50 fewer lines of complex DOM manipulation code
- **Performance**: No redundant HTML parsing on paste operations

## Browser Support

- **Modern browsers** with ES2020+ support
- **Development**: Chrome/Firefox recommended for best dev tools experience
- **Production**: Tested on Chrome, Firefox, Safari, Edge

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Run tests: `npm test`
4. Commit changes: `git commit -m 'Add amazing feature'`
5. Push branch: `git push origin feature/amazing-feature`
6. Open a Pull Request

## License

MIT License - see LICENSE file for details.

---

Built with ❤️ using [Lexical](https://lexical.dev/) and [React](https://react.dev/).