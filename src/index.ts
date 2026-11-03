export { CodeEditor, type CodeEditorOptions } from './editor'
export { defineCodeEditor, CODE_EDITOR_TAG, type DskCodeEditorElement } from './element'
export { readText, writeText, detectLineBreak, type Text, type LineBreak } from './text'
export { supportsEditContext } from './support'
export { CODE_EDITOR_CSS } from './style'
export { Doc, type Line } from './state/doc'
export { ChangeSet, type Change } from './state/changes'
export { Selection, SelectionRange } from './state/selection'
export {
  EditorState,
  composeLines,
  type EditorConfig,
  type LineChange,
  type Position,
  type PositionEdit,
  type Transaction,
  type TransactionSpec,
} from './state/state'
export type { Diagnostic } from './view/diagnostics'
export type { Fold } from './view/folding'
export type { GutterMark, Annotation } from './view/gutter'
export { History } from './state/history'
export * as commands from './commands'
export type { Command, CommandContext } from './commands'
export {
  defaultKeymap,
  compileKeymap,
  keyName,
  normalizeKey,
  type KeyBinding,
  type KeyAction,
} from './keymap'
export { languageEditing, type LanguageEditing } from './language'
export { searchPattern, matchesIn, findFrom, type SearchQuery, type Match } from './search'
export {
  parseEditorConfig,
  editorConfigFor,
  indentOptions,
  detectIndent,
  type EditorConfigSettings,
} from './editorconfig'
export type { CompletionItem, CompletionContext, CompletionSource } from './view/completion'
export { expandSnippet, type MenuItem, type PopupContent } from './view/popups'
