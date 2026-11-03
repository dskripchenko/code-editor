# Erste Schritte

> 0.0.x ist das Gerüst des Pakets: Der Editor zeigt einen Text und gibt ihn
> zurück. Bearbeiten kommt mit 0.1.0.

## Installation

```sh
pnpm add @dskripchenko/code-editor
```

## Auf einem Element

```ts
import { CodeEditor } from '@dskripchenko/code-editor'

const editor = new CodeEditor(document.getElementById('editor')!, {
  value: text,
  language: 'typescript', // eine Sprach-ID aus @dskripchenko/syntax
  lineNumbers: true, // Standard
})

editor.value // der Text, mit den Zeilenumbrüchen, mit denen er kam
editor.value = other // ersetzt den Text
editor.language = 'php'
editor.lineCount
editor.destroy() // nimmt ihn von der Seite
```

Der Editor legt seine Regeln einmal ins Dokument (oder in die Shadow Root, in
der er steht); `CODE_EDITOR_CSS` sind dieselben Regeln für eine Seite, die
sie selbst einbinden will.

## Als Element

```ts
import { defineCodeEditor } from '@dskripchenko/code-editor'

defineCodeEditor() // <dsk-code-editor>; defineCodeEditor('my-editor') für einen anderen Namen
```

```html
<dsk-code-editor language="yaml"><script type="text/plain">key: value
</script></dsk-code-editor>
```

Der Text wird aus einem `<script type="text/plain">` im Element gelesen, also
wird nichts darin als Markup verstanden; die Eigenschaft `value` liest und
ersetzt ihn. Beim Verschieben auf der Seite behält das Element seinen Text.

## Zeilenumbrüche

`readText` und `writeText` nutzt der Editor selbst: Zeilen ohne Umbrüche, der
Umbruch des Textes (`\n` oder `\r\n`, der erste gefundene) und ob er mit
einem endet. Ein Text kommt genau so zurück, wie er gelesen wurde.

## Theme

Farben und Schrift sind Custom Properties auf `.dsk-code-editor`
(`--dsk-code-editor-bg`, `--dsk-code-editor-fg`, `--dsk-code-editor-gutter-fg`,
`--dsk-code-editor-font`, `--dsk-code-editor-font-size`,
`--dsk-code-editor-line-height`). Dunkel folgt `data-theme="dark"` an einem
Vorfahren oder dem System.

## Browser

Chromium bekommt Eingaben über die EditContext-API, WebKit und Firefox über
eine versteckte Textarea; `supportsEditContext()` sagt, welchen Weg ein
Browser nimmt.
