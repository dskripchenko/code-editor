---
'@dskripchenko/code-editor': patch
---

Highlighting, folding and checks while editing.

- The `language` colours the text as it is typed, through `@dskripchenko/syntax`'s `IncrementalHighlighter`: an edit is tokenized again only until the text below is back as it was; the rest of a long file is settled in idle time.
- Folding: markers beside the line numbers, Cmd+Alt+[ / ] on macOS and Ctrl+Shift+[ / ] elsewhere, `fold`, `unfold`, `foldAll`, `unfoldAll`, `folds`; moves up and down go over folded lines.
- Diagnostics: data formats (JSON, YAML, XML, TOML, CSV, INI, `.env`) are checked a moment after each edit, the errors underlined and their lines marked; `setDiagnostics(list, source)` adds the page's own, `diagnostics` lists them, `dsk:diagnostics` tells of changes. The `validate` option turns the check off.
- Every transaction carries the lines it changed (`lines`); `composeLines` joins two.
- Shortcuts on punctuation keys work whatever Shift, Alt or the layout make of the key.
