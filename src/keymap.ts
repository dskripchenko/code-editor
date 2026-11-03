/**
 * Keys to commands. A binding is written `Mod-Shift-z`: `Mod` is Cmd on
 * macOS and Ctrl elsewhere. A letter is read by its place on the keyboard
 * when the layout gives a non-Latin one, so Cmd+Z is undo in a Cyrillic
 * layout too.
 */
import * as c from './commands'
import type { Command } from './commands'

export type KeyAction =
  | Command
  | 'undo'
  | 'redo'
  | 'copy'
  | 'cut'
  | 'paste'
  | 'fold'
  | 'unfold'
  | 'goToLine'
  | 'findNext'
  | 'findPrevious'
  | 'complete'
  | 'jumpToBracket'
  | 'signatureHelp'

export interface KeyBinding {
  readonly key: string
  /** The key on macOS, when it differs. */
  readonly mac?: string
  /** The key elsewhere, when it differs. */
  readonly other?: string
  readonly run: KeyAction
  /** Runs even when the editor is read-only (moves, selection). */
  readonly readOnly?: boolean
}

export function isMac(): boolean {
  if (typeof navigator === 'undefined') return false
  // `navigator.platform` first: it is everywhere and names the real system (an emulated user agent may not).
  const platform =
    navigator.platform ||
    (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ||
    ''
  return /mac|iphone|ipad/i.test(platform)
}

const MODIFIERS = ['Alt', 'Ctrl', 'Meta', 'Shift'] as const

/** A binding's name in one form: modifiers in order, then the key. */
export function normalizeKey(name: string, mac: boolean): string {
  const parts = name.split(/-(?!$)/)
  let key = parts.pop()!
  const mods = new Set<string>()
  for (const p of parts) {
    if (p === 'Mod') mods.add(mac ? 'Meta' : 'Ctrl')
    else if (p === 'Cmd') mods.add('Meta')
    else if (p === 'Control') mods.add('Ctrl')
    else mods.add(p)
  }
  if (key.length === 1) key = key.toLowerCase()
  if (key === 'Space') key = ' '
  return [...MODIFIERS.filter((m) => mods.has(m)), key].join('-')
}

const PUNCTUATION: Record<string, string> = {
  BracketLeft: '[',
  BracketRight: ']',
  Slash: '/',
  Backslash: '\\',
  Minus: '-',
  Equal: '=',
  Comma: ',',
  Period: '.',
  Semicolon: ';',
  Quote: "'",
  Backquote: '`',
}

/** A key event's name, as `normalizeKey` writes bindings. */
export function keyName(
  event: Pick<KeyboardEvent, 'key' | 'code' | 'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey'>,
): string {
  let key = event.key
  if (key.length === 1) {
    key = key.toLowerCase()
    // A letter of another alphabet (or one Alt changed on macOS): the Latin letter on that key.
    if (!/^[\x20-\x7e]$/.test(key) || event.altKey) {
      const m = /^Key([A-Z])$/.exec(event.code) ?? /^Digit(\d)$/.exec(event.code)
      if (m) key = m[1]!.toLowerCase()
    }
    // A shortcut on a punctuation key: the key itself, whatever Shift, Alt or the layout make of it.
    if ((event.ctrlKey || event.metaKey || event.altKey) && PUNCTUATION[event.code])
      key = PUNCTUATION[event.code]!
  }
  const mods: string[] = []
  if (event.altKey) mods.push('Alt')
  if (event.ctrlKey) mods.push('Ctrl')
  if (event.metaKey) mods.push('Meta')
  if (event.shiftKey) mods.push('Shift')
  return [...mods, key].join('-')
}

export const defaultKeymap: readonly KeyBinding[] = [
  { key: 'ArrowLeft', run: c.cursorCharLeft, readOnly: true },
  { key: 'ArrowRight', run: c.cursorCharRight, readOnly: true },
  { key: 'Shift-ArrowLeft', run: c.selectCharLeft, readOnly: true },
  { key: 'Shift-ArrowRight', run: c.selectCharRight, readOnly: true },
  { key: 'Ctrl-ArrowLeft', mac: 'Alt-ArrowLeft', run: c.cursorWordLeft, readOnly: true },
  { key: 'Ctrl-ArrowRight', mac: 'Alt-ArrowRight', run: c.cursorWordRight, readOnly: true },
  {
    key: 'Ctrl-Shift-ArrowLeft',
    mac: 'Alt-Shift-ArrowLeft',
    run: c.selectWordLeft,
    readOnly: true,
  },
  {
    key: 'Ctrl-Shift-ArrowRight',
    mac: 'Alt-Shift-ArrowRight',
    run: c.selectWordRight,
    readOnly: true,
  },
  { key: 'Meta-ArrowLeft', other: '', run: c.cursorLineBoundaryBackward, readOnly: true },
  { key: 'Meta-ArrowRight', other: '', run: c.cursorLineEnd, readOnly: true },
  { key: 'Meta-Shift-ArrowLeft', other: '', run: c.selectLineBoundaryBackward, readOnly: true },
  { key: 'Meta-Shift-ArrowRight', other: '', run: c.selectLineEnd, readOnly: true },
  { key: 'ArrowUp', run: c.cursorLineUp, readOnly: true },
  { key: 'ArrowDown', run: c.cursorLineDown, readOnly: true },
  { key: 'Shift-ArrowUp', run: c.selectLineUp, readOnly: true },
  { key: 'Shift-ArrowDown', run: c.selectLineDown, readOnly: true },
  { key: 'Meta-ArrowUp', other: '', run: c.cursorDocStart, readOnly: true },
  { key: 'Meta-ArrowDown', other: '', run: c.cursorDocEnd, readOnly: true },
  { key: 'Meta-Shift-ArrowUp', other: '', run: c.selectDocStart, readOnly: true },
  { key: 'Meta-Shift-ArrowDown', other: '', run: c.selectDocEnd, readOnly: true },
  { key: 'Home', run: c.cursorLineBoundaryBackward, readOnly: true },
  { key: 'End', run: c.cursorLineEnd, readOnly: true },
  { key: 'Shift-Home', run: c.selectLineBoundaryBackward, readOnly: true },
  { key: 'Shift-End', run: c.selectLineEnd, readOnly: true },
  { key: 'Mod-Home', run: c.cursorDocStart, readOnly: true },
  { key: 'Mod-End', run: c.cursorDocEnd, readOnly: true },
  { key: 'Mod-Shift-Home', run: c.selectDocStart, readOnly: true },
  { key: 'Mod-Shift-End', run: c.selectDocEnd, readOnly: true },
  { key: 'PageUp', run: c.cursorPageUp, readOnly: true },
  { key: 'PageDown', run: c.cursorPageDown, readOnly: true },
  { key: 'Shift-PageUp', run: c.selectPageUp, readOnly: true },
  { key: 'Shift-PageDown', run: c.selectPageDown, readOnly: true },
  // Emacs moves macOS has in every text field.
  { key: 'Ctrl-a', other: '', run: c.cursorLineStart, readOnly: true },
  { key: 'Ctrl-e', other: '', run: c.cursorLineEnd, readOnly: true },
  { key: 'Mod-a', run: c.selectAll, readOnly: true },
  { key: 'Escape', run: c.simplifySelection, readOnly: true },
  { key: 'Enter', run: c.insertNewline },
  { key: 'Shift-Enter', run: c.insertNewline },
  { key: 'Tab', run: c.insertTab },
  { key: 'Shift-Tab', run: c.indentLess },
  { key: 'Mod-]', run: c.indentMore },
  { key: 'Mod-[', run: c.indentLess },
  { key: 'Backspace', run: c.deleteBackward },
  { key: 'Shift-Backspace', run: c.deleteBackward },
  { key: 'Mod-/', run: c.toggleLineComment },
  { key: 'Shift-Alt-a', run: c.toggleBlockComment },
  { key: 'Alt-ArrowUp', run: c.moveLineUp },
  { key: 'Alt-ArrowDown', run: c.moveLineDown },
  { key: 'Shift-Alt-ArrowUp', run: c.copyLineUp },
  { key: 'Shift-Alt-ArrowDown', run: c.copyLineDown },
  { key: 'Mod-Shift-k', run: c.deleteLine },
  { key: 'Mod-Enter', run: c.insertLineAfter },
  { key: 'Mod-Shift-Enter', run: c.insertLineBefore },
  { key: 'Mod-l', run: c.selectLine, readOnly: true },
  { key: 'Ctrl-Alt-ArrowUp', mac: 'Meta-Alt-ArrowUp', run: c.addCursorAbove, readOnly: true },
  { key: 'Ctrl-Alt-ArrowDown', mac: 'Meta-Alt-ArrowDown', run: c.addCursorBelow, readOnly: true },
  { key: 'Mod-d', run: c.selectNextOccurrence, readOnly: true },
  { key: 'Mod-Shift-l', run: c.selectAllOccurrences, readOnly: true },
  { key: 'Ctrl-g', run: 'goToLine', readOnly: true },
  { key: 'F3', mac: 'Meta-g', run: 'findNext', readOnly: true },
  { key: 'Shift-F3', mac: 'Meta-Shift-g', run: 'findPrevious', readOnly: true },
  { key: 'Ctrl-Space', run: 'complete' },
  { key: 'Mod-Shift-Space', run: 'signatureHelp' },
  { key: 'Mod-Shift-\\', run: 'jumpToBracket', readOnly: true },
  { key: 'Delete', run: c.deleteCharForward },
  { key: 'Ctrl-Backspace', mac: 'Alt-Backspace', run: c.deleteWordBackward },
  { key: 'Ctrl-Delete', mac: 'Alt-Delete', run: c.deleteWordForward },
  { key: 'Meta-Backspace', other: '', run: c.deleteToLineStart },
  { key: 'Meta-Delete', other: '', run: c.deleteToLineEnd },
  { key: 'Ctrl-k', other: '', run: c.deleteToLineEnd },
  { key: 'Mod-z', run: 'undo' },
  { key: 'Mod-Shift-z', run: 'redo' },
  { key: 'Mod-y', mac: '', run: 'redo' },
  { key: 'Ctrl-Shift-[', mac: 'Meta-Alt-[', run: 'fold', readOnly: true },
  { key: 'Ctrl-Shift-]', mac: 'Meta-Alt-]', run: 'unfold', readOnly: true },
]

/** Bindings by their normalized name, for the platform. */
export function compileKeymap(
  bindings: readonly KeyBinding[],
  mac = isMac(),
): Map<string, KeyBinding> {
  const out = new Map<string, KeyBinding>()
  for (const b of bindings) {
    const name = mac ? (b.mac ?? b.key) : (b.other ?? b.key)
    if (name === '') continue
    const key = normalizeKey(name, mac)
    if (!out.has(key)) out.set(key, b)
  }
  return out
}
