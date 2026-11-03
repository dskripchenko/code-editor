/**
 * `.editorconfig`: the settings for a file from the files found on the way
 * up to it (the host reads them; this package has no file system). And a
 * guess at a text's indentation when nothing says.
 */

export interface EditorConfigSettings {
  indentStyle?: 'tab' | 'space'
  indentSize?: number
  tabWidth?: number
  endOfLine?: 'lf' | 'crlf' | 'cr'
  charset?: string
  insertFinalNewline?: boolean
  trimTrailingWhitespace?: boolean
}

interface Section {
  pattern: string
  props: Record<string, string>
}

/** One `.editorconfig` file: its sections and whether it is the root. */
export function parseEditorConfig(text: string): { root: boolean; sections: Section[] } {
  let root = false
  const sections: Section[] = []
  let current: Section | null = null
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#') || line.startsWith(';')) continue
    const head = /^\[(.*)\]$/.exec(line)
    if (head) {
      current = { pattern: head[1]!, props: {} }
      sections.push(current)
      continue
    }
    const kv = /^([^=:]+)[=:](.*)$/.exec(line)
    if (!kv) continue
    const key = kv[1]!.trim().toLowerCase()
    const value = kv[2]!.trim().replace(/\s+[#;].*$/, '')
    if (current) current.props[key] = value
    else if (key === 'root') root = value.toLowerCase() === 'true'
  }
  return { root, sections }
}

/** An `.editorconfig` glob as a regular expression over a path relative to the file's directory. */
function globToRegExp(pattern: string): RegExp {
  let p = pattern
  // Without a slash it matches a file name at any depth.
  if (!p.includes('/')) p = '**/' + p
  else if (p.startsWith('/')) p = p.slice(1)
  let out = ''
  for (let i = 0; i < p.length; i++) {
    const ch = p[i]!
    if (ch === '*') {
      if (p[i + 1] === '*') {
        i++
        if (p[i + 1] === '/') {
          i++
          out += '(?:.*/)?'
        } else out += '.*'
      } else out += '[^/]*'
    } else if (ch === '?') out += '[^/]'
    else if (ch === '{') {
      const end = p.indexOf('}', i)
      if (end < 0) {
        out += '\\{'
        continue
      }
      const body = p.slice(i + 1, end)
      const range = /^(-?\d+)\.\.(-?\d+)$/.exec(body)
      if (range) {
        const [a, b] = [Number(range[1]), Number(range[2])].sort((x, y) => x - y)
        out += `(?:${Array.from({ length: b! - a! + 1 }, (_, k) => a! + k).join('|')})`
      } else
        out += `(?:${body
          .split(',')
          .map((x) => globToRegExp(x).source.replace(/^\^(?:\(\?:\.\*\/\)\?)?|\$$/g, ''))
          .join('|')})`
      i = end
    } else if (ch === '[') {
      const end = p.indexOf(']', i)
      if (end < 0) out += '\\['
      else {
        out += '[' + p.slice(i + 1, end).replace(/^!/, '^') + ']'
        i = end
      }
    } else out += ch.replace(/[.+^$()|\\]/g, '\\$&')
  }
  return new RegExp(`^${out}$`)
}

/**
 * The settings for a file, from the `.editorconfig` files on the way up to
 * it — `files` maps each one's directory (`/repo`, `/repo/src`) to its text;
 * the nearest wins, a `root = true` file ends the way up.
 */
export function editorConfigFor(path: string, files: Record<string, string>): EditorConfigSettings {
  const norm = path.replace(/\\/g, '/')
  const dirs = Object.keys(files)
    .map((d) => d.replace(/\\/g, '/').replace(/\/$/, ''))
    .filter((d) => norm.startsWith(d + '/'))
    .sort((a, b) => a.length - b.length)
  // From the root down: the last root file and everything below it.
  const parsed = dirs.map((d) => ({
    dir: d,
    ...parseEditorConfig(files[d] ?? files[d + '/'] ?? ''),
  }))
  let start = 0
  parsed.forEach((p, i) => {
    if (p.root) start = i
  })
  const props: Record<string, string> = {}
  for (const p of parsed.slice(start)) {
    const rel = norm.slice(p.dir.length + 1)
    for (const s of p.sections) if (globToRegExp(s.pattern).test(rel)) Object.assign(props, s.props)
  }
  const out: EditorConfigSettings = {}
  const lower = (k: string) => props[k]?.toLowerCase()
  const style = lower('indent_style')
  if (style === 'tab' || style === 'space') out.indentStyle = style
  const size = lower('indent_size')
  if (size === 'tab') out.indentSize = Number(props.tab_width) || undefined
  else if (size && Number(size) > 0) out.indentSize = Number(size)
  if (Number(props.tab_width) > 0) out.tabWidth = Number(props.tab_width)
  else if (out.indentSize) out.tabWidth = out.indentSize
  const eol = lower('end_of_line')
  if (eol === 'lf' || eol === 'crlf' || eol === 'cr') out.endOfLine = eol
  if (props.charset) out.charset = lower('charset')
  if (props.insert_final_newline) out.insertFinalNewline = lower('insert_final_newline') === 'true'
  if (props.trim_trailing_whitespace)
    out.trimTrailingWhitespace = lower('trim_trailing_whitespace') === 'true'
  return out
}

/** The editor's options from the settings: what Tab inserts and a tab's width. */
export function indentOptions(settings: EditorConfigSettings): {
  indentUnit?: string
  tabSize?: number
} {
  const out: { indentUnit?: string; tabSize?: number } = {}
  if (settings.tabWidth) out.tabSize = settings.tabWidth
  if (settings.indentStyle === 'tab') out.indentUnit = '\t'
  else if (settings.indentStyle === 'space' || settings.indentSize)
    out.indentUnit = ' '.repeat(settings.indentSize ?? settings.tabWidth ?? 4)
  return out
}

/**
 * A guess at how a text is indented, from its lines' indentation (the first
 * few thousand): `'\t'`, or spaces of the commonest step; null when it has
 * too little indentation to tell.
 */
export function detectIndent(text: string): string | null {
  let tabs = 0
  let spaces = 0
  const steps = new Map<number, number>()
  let previous = 0
  for (const line of text.split('\n', 10_000)) {
    if (line.trim() === '') continue
    const indent = /^[ \t]*/.exec(line)![0]
    if (indent.startsWith('\t')) tabs++
    else if (indent.length > 0) spaces++
    if (!indent.includes('\t')) {
      const step = Math.abs(indent.length - previous)
      if (step > 1 && step <= 8) steps.set(step, (steps.get(step) ?? 0) + 1)
      previous = indent.length
    }
  }
  if (tabs + spaces < 2) return null
  if (tabs > spaces) return '\t'
  let best = 0
  let count = 0
  for (const [step, n] of steps)
    if (n > count || (n === count && step < best)) [best, count] = [step, n]
  return best ? ' '.repeat(best) : null
}
