---
'@dskripchenko/code-editor': minor
---

The editing commands of a code editor, with VS Code's keys.

- Indentation: Enter indents a step deeper after an opening bracket (and after what the language indents after: `:` in Python and YAML), splits a bracket pair over three lines; Tab and Shift+Tab, Mod+] and Mod+[ indent and outdent lines; Backspace in the indentation goes back a whole step. Without `indentUnit` it is guessed from the text (`detectIndent`); `configure` changes it; `editorConfigFor` and `indentOptions` read `.editorconfig` files the page passes in.
- Brackets and quotes close as they are typed, a closing one types over the same character, a selection is wrapped, Backspace between a pair deletes both (`closeBrackets: false` turns it off); the bracket at the cursor and its pair are marked, Mod+Shift+\ jumps between them.
- Comments: Mod+/ line comments, Shift+Alt+A block comments, per language (`languageEditing`).
- Lines: move (Alt+↑/↓), copy (Shift+Alt+↑/↓), delete (Mod+Shift+K), a new line below or above (Mod+Enter, Mod+Shift+Enter), select the line (Mod+L); copy and cut without a selection take the whole line, pasted above the cursor's line.
- Several cursors: a cursor above or below (Cmd+Alt+↑/↓ on macOS, Ctrl+Alt+↑/↓ elsewhere), the next occurrence (Mod+D), all occurrences (Mod+Shift+L).
- Go to line: Ctrl+G on every system opens a field (`line` or `line:column`); `goToLine`, `openGoToLine`.
- Search: `setSearch` (text or regular expression, case, whole words) marks the matches in view; `findNext`/`findPrevious` (Cmd+G / Cmd+Shift+G on macOS, F3 / Shift+F3 elsewhere), `replaceNext`, `replaceAll`, `searchMatches`.
- Completion: a list under the cursor from the page's `completion` source and the words of the text; arrows, Enter or Tab, Escape; Ctrl+Space; `startCompletion`.
