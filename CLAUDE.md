# Claude Code Context

This file provides context for future Claude Code sessions about this project's architecture and decisions.

## Project Overview

Lexical editor prototype with a **composition-based heading policy system** that enforces H1-H3 only headings.

## Key Architecture

### Heading Policy System
- **HeadingPolicyPlugin**: Single node transform enforces H1-H3 policy
- **Stock HeadingNode**: Uses Lexical's built-in node (no inheritance)
- **Transform-only approach**: Normalizes h4-h6 → h3 after any update
- **Content preservation**: All formatting, attributes, children maintained

### Important Files
- `src/plugins/HeadingPolicyPlugin.tsx` - Core policy enforcement
- `src/constants/heading-policy.ts` - Policy configuration constants
- `src/commands/heading-commands.ts` - Unified heading commands
- `src/__tests__/heading.test.ts` - Comprehensive test suite

### Design Decisions
1. **Composition over Inheritance**: Avoids CustomHeadingNode maintenance burden
2. **Single Source of Truth**: One transform handles all content sources
3. **Safer Defaults**: Always blocks heading conversion in list items
4. **Idempotent Operations**: Transform can run multiple times safely

## Development Commands

```bash
npm test              # Run all tests (42 tests)
npm run build         # Production build
npm run dev           # Development server
```

## Test Strategy
- **Tree Invariant**: Ensures no h4-h6 survive any operation
- **Content Preservation**: Validates formatting/text preservation
- **Command Layer**: Tests formatHeading with various options
- **Policy Enforcement**: Direct transform testing

## Migration Notes
- Migrated from `CustomHeadingNode` (inheritance) to `HeadingPolicyPlugin` (composition)
- All functionality preserved, significantly reduced complexity
- 25 files changed, comprehensive test coverage maintained

## Future Considerations
- CustomHeadingNode files can be removed in cleanup PR
- Consider configurable policy (H1-H4, etc.) if needed
- Monitor performance with large documents