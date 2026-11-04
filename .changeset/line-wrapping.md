---
'@dskripchenko/code-editor': minor
---

Soft wrapping: `lineWrapping: true` (or `editor.lineWrapping = true`) wraps long lines at the view's width into rows — after the last space that fits, a longer word where the row is full; tabs to their stop, CJK and emoji two columns. Up and down go by rows keeping the column, clicks land on the row under the pointer, selections, matches and diagnostics are drawn on every row they cover, and the rows follow the view's width. Lines over 10 000 characters stay unwrapped.

The editor's measuring ruler no longer widens the content (a wrapped view never scrolls sideways).
