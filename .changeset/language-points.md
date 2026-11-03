---
'@dskripchenko/code-editor': minor
---

Points for what a language knows, from the page (a language server, say): `hover` shows what is under a resting pointer, `signatureHelp` a call's parameters after `(` and `,` (and Mod+Shift+Space), `onModClick` takes a Cmd/Ctrl+click (going to a definition); `menu(items)` is a list at the cursor, `prompt(from, to)` a field over a word, `coordsAt`/`posAtPoint` map positions and points, `showTooltip` shows the page's own. Completion items may be snippets (`${1:name}` places) and replace a range of their own. Transactions and `dsk:change` carry `edits`: the changes as line and character (UTF-16) ranges, in the order to apply them.
