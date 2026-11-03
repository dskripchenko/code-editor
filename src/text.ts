/**
 * A text as the editor holds it: lines without their breaks, plus what is
 * needed to write it back exactly as it was read — the line break the file
 * uses and whether it ends with one.
 */

export type LineBreak = '\n' | '\r\n'

export interface Text {
  readonly lines: readonly string[]
  /** The line break used to write the text: the one the text was read with. */
  readonly lineBreak: LineBreak
  /** Whether the text ends with a line break (one more break, not one more line). */
  readonly finalBreak: boolean
}

/**
 * Lines of a text. The line break is the one met first (`\n` when there is
 * none); a text that mixes them is read line by line all the same and
 * written with that one.
 */
export function readText(text: string): Text {
  const first = text.indexOf('\n')
  const lineBreak: LineBreak = first > 0 && text[first - 1] === '\r' ? '\r\n' : '\n'
  const lines = text.split(/\r?\n/)
  const finalBreak = lines.length > 1 && lines[lines.length - 1] === ''
  if (finalBreak) lines.pop()
  return { lines, lineBreak, finalBreak }
}

/** The text back as a string, with its line break and its final break. */
export function writeText(text: Text): string {
  const body = text.lines.join(text.lineBreak)
  return text.finalBreak ? body + text.lineBreak : body
}
