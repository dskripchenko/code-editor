# @dskripchenko/code-editor

## 0.4.0

### Minor Changes

- 5a27abf: Soft wrapping: `lineWrapping: true` (or `editor.lineWrapping = true`) wraps long lines at the view's width into rows — after the last space that fits, a longer word where the row is full; tabs to their stop, CJK and emoji two columns. Up and down go by rows keeping the column, clicks land on the row under the pointer, selections, matches and diagnostics are drawn on every row they cover, and the rows follow the view's width. Lines over 10 000 characters stay unwrapped.

  The editor's measuring ruler no longer widens the content (a wrapped view never scrolls sideways).

## 0.3.0

### Minor Changes

- c03dbfe: Points for what a language knows, from the page (a language server, say): `hover` shows what is under a resting pointer, `signatureHelp` a call's parameters after `(` and `,` (and Mod+Shift+Space), `onModClick` takes a Cmd/Ctrl+click (going to a definition); `menu(items)` is a list at the cursor, `prompt(from, to)` a field over a word, `coordsAt`/`posAtPoint` map positions and points, `showTooltip` shows the page's own. Completion items may be snippets (`${1:name}` places) and replace a range of their own. Transactions and `dsk:change` carry `edits`: the changes as line and character (UTF-16) ranges, in the order to apply them.

### Patch Changes

- c03dbfe: The editor measures its lines again whenever their height or font changes (a hidden ruler watched by a `ResizeObserver`): made outside the page, or with `--dsk-code-editor-line-height` changed later, a click or a hover far down a file no longer lands lines below the pointer. A completion or menu item picked with a click keeps the cursor where the item went, and a tooltip stays open over transactions that move neither the text nor the cursor.

## 0.2.0

### Minor Changes

- fe13ec4: Marks and annotations in the gutter: `setGutterMarks(marks, source)` draws marks beside lines — `added`, `modified`, `deleted` (a diff against the last commit), or a kind of the page's own — and a click on one sends `dsk:gutter-mark`; `setAnnotations(list)` adds a column of short text by the line numbers (who changed a line, and when), a click sending `dsk:annotation`. Both follow the lines as the text is edited.

## 0.1.2

### Patch Changes

- 6d20fea: `editorConfigFor` reads the files of directories given in Windows form (backslashes): their text was looked up by the path after it had been rewritten with forward slashes, and found empty.

## 0.1.1

### Patch Changes

- 72edc76: `editor.lineBreak` tells the line break in use (`\n` or `\r\n`); the editor sends `dsk:selection` (its `detail.selection`) whenever the cursors move or the text under them changes, for a status line.

## 0.1.0

### Minor Changes

- 7ce4e8e: The editing commands of a code editor, with VS Code's keys.

  - Indentation: Enter indents a step deeper after an opening bracket (and after what the language indents after: `:` in Python and YAML), splits a bracket pair over three lines; Tab and Shift+Tab, Mod+] and Mod+[ indent and outdent lines; Backspace in the indentation goes back a whole step. Without `indentUnit` it is guessed from the text (`detectIndent`); `configure` changes it; `editorConfigFor` and `indentOptions` read `.editorconfig` files the page passes in.
  - Brackets and quotes close as they are typed, a closing one types over the same character, a selection is wrapped, Backspace between a pair deletes both (`closeBrackets: false` turns it off); the bracket at the cursor and its pair are marked, Mod+Shift+\ jumps between them.
  - Comments: Mod+/ line comments, Shift+Alt+A block comments, per language (`languageEditing`).
  - Lines: move (Alt+↑/↓), copy (Shift+Alt+↑/↓), delete (Mod+Shift+K), a new line below or above (Mod+Enter, Mod+Shift+Enter), select the line (Mod+L); copy and cut without a selection take the whole line, pasted above the cursor's line.
  - Several cursors: a cursor above or below (Cmd+Alt+↑/↓ on macOS, Ctrl+Alt+↑/↓ elsewhere), the next occurrence (Mod+D), all occurrences (Mod+Shift+L).
  - Go to line: Ctrl+G on every system opens a field (`line` or `line:column`); `goToLine`, `openGoToLine`.
  - Search: `setSearch` (text or regular expression, case, whole words) marks the matches in view; `findNext`/`findPrevious` (Cmd+G / Cmd+Shift+G on macOS, F3 / Shift+F3 elsewhere), `replaceNext`, `replaceAll`, `searchMatches`.
  - Completion: a list under the cursor from the page's `completion` source and the words of the text; arrows, Enter or Tab, Escape; Ctrl+Space; `startCompletion`.

## 0.0.3

### Patch Changes

- adcc38e: Highlighting, folding and checks while editing.

  - The `language` colours the text as it is typed, through `@dskripchenko/syntax`'s `IncrementalHighlighter`: an edit is tokenized again only until the text below is back as it was; the rest of a long file is settled in idle time.
  - Folding: markers beside the line numbers, Cmd+Alt+[ / ] on macOS and Ctrl+Shift+[ / ] elsewhere, `fold`, `unfold`, `foldAll`, `unfoldAll`, `folds`; moves up and down go over folded lines.
  - Diagnostics: data formats (JSON, YAML, XML, TOML, CSV, INI, `.env`) are checked a moment after each edit, the errors underlined and their lines marked; `setDiagnostics(list, source)` adds the page's own, `diagnostics` lists them, `dsk:diagnostics` tells of changes. The `validate` option turns the check off.
  - Every transaction carries the lines it changed (`lines`); `composeLines` joins two.
  - Shortcuts on punctuation keys work whatever Shift, Alt or the layout make of the key.

## 0.0.2

### Patch Changes

- 2dfe32c: Editing, without highlighting yet: a text model changed by transactions (positions follow every change), undo and redo by step, input through EditContext in Chromium and a hidden textarea elsewhere (IME composition on both), moves and selection by keys and pointer (by character over whole graphemes, by word, smart Home, columns kept over tabs, pages, several cursors with Alt+click), the clipboard, shortcuts that work in any keyboard layout, read-only mode and `dsk:change`. Only the lines in view are drawn and a very long line only around the columns in view: a file of a million lines opens in a second or two and takes a key in well under a frame. A text's final line break is now its last, empty line, as in other editors.

## 0.0.1

### Patch Changes

- 50a1e96: The first release: the package's frame — `CodeEditor` on an element and `<dsk-code-editor>`, showing a text's lines with their numbers; the text read and written with its line breaks kept as they were. Editing comes next.
