/**
 * The EditContext API (Chromium 121+), as far as the editor uses it. The
 * TypeScript DOM library does not describe it yet.
 */

export interface EditContextLike extends EventTarget {
  readonly text: string
  readonly selectionStart: number
  readonly selectionEnd: number
  updateText(rangeStart: number, rangeEnd: number, text: string): void
  updateSelection(start: number, end: number): void
  updateControlBounds(bounds: DOMRect): void
  updateSelectionBounds(bounds: DOMRect): void
  updateCharacterBounds(rangeStart: number, bounds: DOMRect[]): void
}

export interface TextUpdateEventLike extends Event {
  readonly updateRangeStart: number
  readonly updateRangeEnd: number
  readonly text: string
  readonly selectionStart: number
  readonly selectionEnd: number
}

export interface TextFormatLike {
  readonly rangeStart: number
  readonly rangeEnd: number
  readonly underlineStyle: string
  readonly underlineThickness: string
}

export interface TextFormatUpdateEventLike extends Event {
  getTextFormats(): TextFormatLike[]
}

export interface CharacterBoundsUpdateEventLike extends Event {
  readonly rangeStart: number
  readonly rangeEnd: number
}

export function createEditContext(): EditContextLike | null {
  const ctor = (globalThis as unknown as { EditContext?: new () => EditContextLike }).EditContext
  return ctor ? new ctor() : null
}
