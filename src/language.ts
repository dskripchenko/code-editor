/**
 * What the editing commands need to know of a language: how it comments a
 * line or a block, which brackets and quotes pair up, and after what a new
 * line is indented one step deeper. Keyed by the language ids of
 * @dskripchenko/syntax; a language not listed gets the C-like defaults.
 */

export interface LanguageEditing {
  /** A line comment's mark (`//`, `#`); none when the language has no line comments. */
  readonly lineComment?: string
  /** A block comment's marks (`/*`, `*\/`). */
  readonly blockComment?: readonly [string, string]
  /** Pairs closed as the opening one is typed (and wrapped around a selection). */
  readonly pairs: readonly (readonly [string, string])[]
  /** A line ending like this indents the next one a step deeper (besides an open bracket). */
  readonly indentAfter?: RegExp
}

const BRACKETS: readonly (readonly [string, string])[] = [
  ['(', ')'],
  ['[', ']'],
  ['{', '}'],
]
const QUOTES2: readonly (readonly [string, string])[] = [
  ['"', '"'],
  ["'", "'"],
]
const C_LIKE: LanguageEditing = {
  lineComment: '//',
  blockComment: ['/*', '*/'],
  pairs: [...BRACKETS, ...QUOTES2],
}
const HASH: LanguageEditing = { lineComment: '#', pairs: [...BRACKETS, ...QUOTES2] }
const MARKUP: LanguageEditing = {
  blockComment: ['<!--', '-->'],
  pairs: [...BRACKETS, ['"', '"'], ["'", "'"]],
}

const TABLE: Record<string, LanguageEditing> = {
  javascript: { ...C_LIKE, pairs: [...C_LIKE.pairs, ['`', '`']] },
  typescript: { ...C_LIKE, pairs: [...C_LIKE.pairs, ['`', '`']] },
  go: { ...C_LIKE, pairs: [...C_LIKE.pairs, ['`', '`']] },
  rust: { ...C_LIKE, pairs: [...BRACKETS, ['"', '"']] },
  java: C_LIKE,
  kotlin: C_LIKE,
  csharp: C_LIKE,
  swift: C_LIKE,
  c: C_LIKE,
  cpp: C_LIKE,
  php: { ...C_LIKE, pairs: [...C_LIKE.pairs, ['`', '`']] },
  css: { ...C_LIKE, lineComment: undefined },
  jsonc: { ...C_LIKE, pairs: [...BRACKETS, ['"', '"']] },
  json: { pairs: [...BRACKETS, ['"', '"']] },
  jsonl: { pairs: [...BRACKETS, ['"', '"']] },
  graphql: { ...HASH, pairs: [...BRACKETS, ['"', '"']] },
  protobuf: C_LIKE,
  python: { ...HASH, indentAfter: /:\s*(#.*)?$/ },
  ruby: {
    ...HASH,
    indentAfter:
      /(^\s*(def|class|module|if|unless|while|until|case|begin|else|elsif|when)\b.*|\bdo(\s*\|[^|]*\|)?)\s*$/,
  },
  bash: { ...HASH, pairs: [...C_LIKE.pairs, ['`', '`']] },
  powershell: { ...HASH, blockComment: ['<#', '#>'] },
  yaml: { ...HASH, indentAfter: /:\s*(#.*)?$/ },
  toml: HASH,
  dotenv: HASH,
  dockerfile: HASH,
  makefile: { ...HASH, indentAfter: /^[^\s#=]+:([^=]|$).*$/ },
  ini: { lineComment: ';', pairs: [...BRACKETS, ...QUOTES2] },
  lua: { lineComment: '--', blockComment: ['--[[', ']]'], pairs: [...BRACKETS, ...QUOTES2] },
  sql: { lineComment: '--', blockComment: ['/*', '*/'], pairs: [...BRACKETS, ...QUOTES2] },
  latex: { lineComment: '%', pairs: [...BRACKETS, ['$', '$']] },
  html: MARKUP,
  xml: MARKUP,
  markdown: { blockComment: ['<!--', '-->'], pairs: [...BRACKETS, ['`', '`'], ['"', '"']] },
  csv: { pairs: [['"', '"']] },
  diff: { pairs: [] },
  log: { pairs: [] },
  http: { lineComment: '#', pairs: [...BRACKETS, ['"', '"']] },
}

/** A language's editing rules (by its id in @dskripchenko/syntax); C-like ones for a language not known, none for plain text. */
export function languageEditing(id: string | null): LanguageEditing {
  if (!id) return { pairs: [...BRACKETS, ...QUOTES2] }
  return TABLE[id] ?? C_LIKE
}
