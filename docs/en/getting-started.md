# Getting started

> 0.1.0: typing (IME included), moving and selecting, undo and redo, the
> clipboard, highlighting as you type, folding, checks of data formats, and
> the editing commands of a code editor — indentation, brackets, comments,
> lines, several cursors, go to line, search, completion.

## Install

```sh
pnpm add @dskripchenko/code-editor
```

## On an element

```ts
import { CodeEditor } from '@dskripchenko/code-editor'

const editor = new CodeEditor(document.getElementById('editor')!, {
  value: text,
  language: 'typescript', // an id from @dskripchenko/syntax
  lineNumbers: true, // the default
  readOnly: false,
  tabSize: 4, // columns a tab takes
  indentUnit: '    ', // what Tab inserts
  onChange: (e) => console.log(e.value.length),
  validate: true, // data formats checked as they are edited
  closeBrackets: true, // brackets and quotes close as they are typed
  completion: undefined, // the page's suggestions (see Completion)
})

editor.value // the text, with the line breaks it was given with
editor.value = other // replaces the text, clears the undo history
editor.selection // [{ anchor, head }] — offsets; a line break is one character
editor.setSelection(0, 5)
editor.undo()
editor.redo()
editor.focus()
editor.readOnly = true
editor.destroy() // takes it off the page
```

**Give the editor a height** (its parent's height, or `.dsk-code-editor`'s):
it scrolls inside it and draws only the lines in view. Without a height it
grows to the whole text and draws all of it.

The editor puts its rules into the document (or the shadow root it is in)
once; `CODE_EDITOR_CSS` is the same rules for a page that wants them itself.

## Changing the text from code

Every change is a transaction — changes against the text before it, and the
cursors after it. It goes into the undo history like typing does.

```ts
import { Selection } from '@dskripchenko/code-editor'

editor.dispatch({
  changes: [{ from: 0, to: 0, insert: '// header\n' }],
  selection: Selection.single(10),
})
```

`editor.state` holds the text (`state.doc`: `lineAt`, `line`, `slice`,
`lineCount`, `length`) and the cursors (`state.selection.ranges`). The
editing commands are in `commands` (`insertText`, `deleteCharBackward`,
`cursorWordRight`…): a command takes the state and gives a transaction.

## Keys

As in VS Code. Mod is Cmd on macOS, Ctrl elsewhere.

| Keys | What |
|---|---|
| arrows, Home, End, Page Up/Down, Mod+Home/End | move (Alt on macOS, Ctrl elsewhere: by word; Home: to the indent, then the line start); Shift extends |
| Enter | a new line with the indent, a step deeper after `{` `(` `[` (and `:` in Python, YAML); between `{}`, the closing one goes a line further |
| Tab / Shift+Tab, Mod+] / Mod+[ | indent and outdent (Tab over lines indents them) |
| Backspace | in the indentation, back a whole step; between `()` or `""`, both |
| Mod+/ · Shift+Alt+A | line comment · block comment, on and off |
| Alt+↑/↓ · Shift+Alt+↑/↓ · Mod+Shift+K | move lines · copy lines · delete lines |
| Mod+Enter · Mod+Shift+Enter | a new line below · above |
| Mod+L | select the line (again: the next one too) |
| Mod+D · Mod+Shift+L | select the word, then its next occurrence · all of them |
| Cmd+Alt+↑/↓ (macOS), Ctrl+Alt+↑/↓ | a cursor more above · below; Alt+click adds one; Escape leaves one |
| Ctrl+G | go to line (on every system) |
| Cmd+G / Cmd+Shift+G (macOS), F3 / Shift+F3 | next · previous match |
| Ctrl+Space | completion |
| Mod+Shift+\\ | to the matching bracket |
| Cmd+Alt+[ / ] (macOS), Ctrl+Shift+[ / ] | fold · unfold |
| Mod+Z · Mod+Shift+Z (Ctrl+Y) · Mod+A | undo · redo · select all |

Brackets and quotes close as they are typed (an apostrophe after a letter
stays one), a closing one types over the same character after the cursor,
and a selection gets wrapped; `closeBrackets: false` turns it off. Copy and
cut with no selection take the whole line; pasted, it goes above the
cursor's line. Shortcuts work in any keyboard layout. Bindings of your own
go first:

```ts
new CodeEditor(el, { keymap: [{ key: 'Mod-s', run: () => (save(), null) }] })
```

## Go to line, search

```ts
editor.goToLine(120, 4) // line and column, from 1; the line comes to the middle of the view
editor.openGoToLine() // the field Ctrl+G opens: `120` or `120:4`, Enter

editor.setSearch({ search: 'todo', caseSensitive: false, wholeWord: true, regexp: false })
editor.findNext() // selects the next match (round past the end); findPrevious()
editor.searchMatches() // [{ from, to }] — counting reads the whole text
editor.setSearch({ search: '(\\w+)=(\\d+)', regexp: true, replace: '$2=$1' })
editor.replaceNext() // the selected match, then the next one selected
editor.replaceAll() // how many; one step to undo
editor.setSearch(null)
```

The matches in view are marked, the selected one more strongly. The editor
has no find bar of its own — the page puts its own over it and drives it with
these; Cmd+G (F3) without a search looks for the selected text.

## Completion

Typing a word (two letters and on) opens a list of what may finish it: the
page's suggestions first, then the words of the text near the cursor.
Arrows move, Enter or Tab picks, Escape closes; Ctrl+Space opens it at any
point.

```ts
new CodeEditor(el, {
  completion: async ({ prefix, pos, explicit, state }) => [
    { label: 'console', detail: 'global', kind: 'variable' },
    { label: 'constructor', insert: 'constructor()' },
  ],
  completeWords: true, // the words of the text too (the default)
})
editor.startCompletion()
```

## Indentation and `.editorconfig`

Without `indentUnit`, the editor guesses it from the text (tabs, or the
commonest step of spaces). The page that has the files gives
`.editorconfig`'s settings:

```ts
import { editorConfigFor, indentOptions } from '@dskripchenko/code-editor'

// The .editorconfig files on the way up to the file, by their directory.
const settings = editorConfigFor('/repo/src/main.ts', {
  '/repo': rootEditorConfigText,
  '/repo/src': srcEditorConfigText,
})
editor.configure(indentOptions(settings)) // { indentUnit: '  ', tabSize: 2 }
settings.endOfLine // 'lf' | 'crlf'; insertFinalNewline, trimTrailingWhitespace — for saving
```

## Pointer

A click puts the cursor, a drag selects (and scrolls past the edge), Shift
extends, a double click takes the word, a triple click the line, Alt+click
adds a cursor.

## Highlighting

The `language` (an id or alias from `@dskripchenko/syntax`: `typescript`,
`yml`, `php`…) colours the text as it is typed: an edit is tokenized again
only until the text below is back to what it was, so a key costs a few lines
however long the file; the rest of a long file is settled in idle time. A
`/*` typed at the top of a big file colours the lines in view at once and the
rest a moment later. `editor.language = 'python'` highlights again; a
language not known leaves the text plain.

## Folding

A block folds from its marker beside the line numbers (it shows on hover),
by Cmd+Alt+[ / Cmd+Alt+] on macOS and Ctrl+Shift+[ / Ctrl+Shift+] elsewhere
(the block at the cursor), or from code:

```ts
editor.fold(4) // the block starting on line 4 (0-based), or the innermost one around it
editor.unfold(4)
editor.foldAll()
editor.unfoldAll()
editor.folds // [{ start: 4, end: 9 }] — the first line stays in view
```

What folds comes from the text (brackets, tags, indentation, Markdown's
headings), read again a moment after an edit. A click on a folded line's `⋯`
opens it, and so does a cursor moved into it; moves up and down go over it.

## Diagnostics

Data formats — JSON, YAML, XML, TOML, CSV, INI, `.env` — are checked a
moment after each edit: an error is underlined, its line number coloured,
and its message is the line's tooltip. The page adds its own (a linter, a
language server) as ranges of the text:

```ts
editor.setDiagnostics([{ from: 8, to: 9, message: 'b is not defined', severity: 'warning' }], 'lint')
editor.diagnostics // all of them, the editor's own (`source: 'syntax'`) and the page's
el.addEventListener('dsk:diagnostics', (e) => show(e.detail.diagnostics))
```

The ranges move with edits until the next check replaces them. Folding and
the check read the whole text; above 2 MB neither runs.

## As an element

```ts
import { defineCodeEditor } from '@dskripchenko/code-editor'

defineCodeEditor() // <dsk-code-editor>; defineCodeEditor('my-editor') for another name
```

```html
<dsk-code-editor language="yaml" style="height: 300px"><script type="text/plain">key: value
</script></dsk-code-editor>
```

The text is read from a `<script type="text/plain">` inside the element, so
nothing in it is taken as markup; the `value` property reads and replaces it,
`readonly` makes it read-only. Every move of the cursors sends `dsk:selection` (its `detail.selection`, for a status line). Every change sends `dsk:change`, its
`detail.source` the text. The element keeps its text when it is moved in the
page.

## Line breaks

`editor.lineBreak` is the one in use. A text keeps the line break it came with (`\n` or `\r\n`, the first one met);
pasted text takes it too. `readText`, `writeText` and `detectLineBreak` are
the helpers.

## Big files

Only the lines in view are in the page, and a line longer than 10 000
characters only around the columns in view: a file of a million lines
(50 MB) opens in a second or two and takes a key in well under a frame.

## Theme

Colours and the font are custom properties on `.dsk-code-editor`
(`--dsk-code-editor-bg`, `-fg`, `-gutter-fg`, `-gutter-active-fg`,
`-gutter-bg`, `-cursor`, `-selection`, `-selection-focused`, `-active-line`,
`-font`, `-font-size`, `-line-height`, `-folded-bg`, `-error`, `-warning`,
`-info`). The tokens' colours are `@dskripchenko/syntax`'s (`--sx-keyword`,
`--sx-string`…). Dark follows `data-theme="dark"` on an ancestor or the system.

## Browsers

Chromium takes input through the EditContext API, WebKit and Firefox through
a hidden textarea at the cursor (it also shows the text being composed);
`supportsEditContext()` tells which one a browser gets.
