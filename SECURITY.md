# Security

`@dskripchenko/code-editor` shows and edits text that may come from anyone —
a file, a page, a pasted snippet. Its job is that this text can never become
active content in the page that shows it.

## What it guarantees

- **Text, never markup.** The text reaches the page only as text nodes
  (`textContent`); nothing in it is parsed as HTML.
- **Markup input stays inert.** `<dsk-code-editor>` reads its text from a
  `<script type="text/plain">` inside it, which the browser never runs or
  parses as HTML.
- **No code execution.** Nothing from the text is evaluated.

## Reporting a vulnerability

Please report it privately through
[GitHub security advisories](https://github.com/dskripchenko/code-editor/security/advisories/new)
rather than a public issue. Include the text that reproduces it.
