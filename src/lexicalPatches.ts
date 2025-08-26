// Patch Lexical's internal ArtificialNode to quiet dev warnings in 0.15.x
// This node is injected internally and not used in persisted docs.
// We add minimal no-op implementations so the dev checks pass.
import { ArtificialNode__DO_NOT_USE } from 'lexical'

export function patchLexicalWarnings() {
  try {
    const AnyNode: any = ArtificialNode__DO_NOT_USE as unknown as any
    if (!Object.prototype.hasOwnProperty.call(ArtificialNode__DO_NOT_USE, 'clone')) {
      AnyNode.clone = (node: any) => new ArtificialNode__DO_NOT_USE((node as any)?.__key)
    }
    if (!Object.prototype.hasOwnProperty.call(ArtificialNode__DO_NOT_USE, 'importJSON')) {
      AnyNode.importJSON = () => new ArtificialNode__DO_NOT_USE()
    }
    if (!Object.prototype.hasOwnProperty.call(ArtificialNode__DO_NOT_USE.prototype, 'exportJSON')) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(ArtificialNode__DO_NOT_USE as any).prototype.exportJSON = function exportJSON() {
        return { type: 'artificial', version: 1 }
      }
    }
  } catch {
    // Ignore – only relevant in dev/browser context
  }
}

